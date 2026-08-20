/**
 * NarrationService — the only thing in the project that produces speech.
 *
 * Consumes the two events the engine has been emitting since the state machine
 * was written, and which nothing implemented until now:
 *
 *   narrationRequested { stepIndex, text }  -> speak this step now
 *   narrationPrefetch  { stepIndex, text }  -> warm the NEXT step quietly
 *   speakRequested     { text, source }     -> queue behind whatever is playing
 *
 * ## The engine must never wait for this
 *
 * That constraint is why the seam was shaped this way in the first place (see
 * "The narration seam" in Docs/SCENE-MAP.md), and it survives here: every path
 * below is fire-and-forget. A synthesis that fails, times out, or arrives after
 * the user has already moved on produces *silence* and a log line. It never
 * blocks a step transition, and it never plays late over the wrong step.
 *
 * ## Why the cache is keyed by TEXT, not by step index
 *
 * "back" and "repeat" ask for a step the user has already heard. Keyed by text,
 * those are free — the AudioTrackAsset is still in the map. Keyed by index they
 * would be free too, right up until a second lesson reused index 2 for
 * different words and the guide confidently said the wrong sentence. Text is
 * the honest key, and it also lets the pre-warmed fixed phrases share one map
 * with the lesson steps.
 *
 * ## Pre-warming
 *
 * Fixed phrases we know at author time — navigation acknowledgements, the
 * safety prefix, the compiling lines, the completion line — cost a live call
 * the first time they are spoken unless they are already in hand. Two ways in,
 * in priority order:
 *
 *   1. `bakedPhrases` + `bakedTracks`: recorded audio wired in the Inspector.
 *      Costs NOTHING, ever, and works with no network. This is the shipping path.
 *   2. `prewarmPhrases`: synthesized once at boot, in the background, spaced out
 *      so the warm-up never competes with a lesson request the user is waiting
 *      on. This is the path that works today with no recording session.
 *
 * ## Every synthesis goes through GatewayQueue
 *
 * Chaining the warm-ups fixed the warm-ups. It did nothing about a step-n+1
 * prefetch landing on top of step-n's synthesis, or either of them landing on
 * top of a lesson request — the same collision, just harder to see. All three
 * now share one slot: prefetch and boot warm-ups at GW_BACKGROUND, the voice
 * the user is waiting for at GW_NARRATION, and lesson/Q&A above both at GW_USER.
 *
 * ## Pending is a visible state, not silence
 *
 * Synthesis measures 6.5-18.6 s, so between a step appearing and its voice
 * arriving there is a long window. The instruction is already on the guide
 * panel — text has never waited on audio — but the HUD used to show nothing at
 * all about the voice during that window, which reads as "it did not hear me".
 * `narrationStateChanged` therefore carries `pending` alongside `speaking`, and
 * the StatusBar renders it. Order is text, then a promise of voice, then voice.
 */
import { eventBus, Events } from "./EventBus";
import { OpenAI } from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI";
import { OPENAI_TTS_MODEL } from "./RsgModels";
import {
  gatewayIdle,
  gatewaySubmit,
  gatewayWasDropped,
  GW_BACKGROUND,
  GW_NARRATION,
} from "./GatewayQueue";

interface Utterance {
  text: string;
  source: string;
}

/** One caller waiting on a synthesis someone else already started. */
interface Waiter {
  onReady: (track: AudioTrackAsset) => void;
  onFailed?: () => void;
}

@component
export class NarrationService extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Voice</span>')

  @input
  @hint("AudioComponent that plays the narration. Needs an AudioTrackAsset slot; the service swaps the track per utterance.")
  private audio: AudioComponent;

  @input
  @hint("OpenAI voice name: coral / alloy / echo / shimmer / nova / onyx.")
  private voice: string = "coral";

  @input
  @widget(new SliderWidget(0.1, 2.0, 0.05))
  private volume: number = 1.0;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Cache</span>')

  @input
  @hint("Maximum synthesized tracks held. Oldest goes first. Baked tracks are never evicted.")
  private maxCacheEntries: number = 24;

  @input
  @widget(new SliderWidget(5, 60, 1))
  @hint("Give up on a synthesis after this long. The step is already on screen; late audio is worse than none.")
  private synthesisTimeoutSec: number = 20;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Pre-baked audio — the zero-cost path</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Wire recorded clips here and the matching phrase never touches the network. bakedPhrases[i] is spoken by bakedTracks[i]; both lists must line up.</span>')

  @input @allowUndefined private bakedPhrases: string[] = [];
  @input @allowUndefined private bakedTracks: AudioTrackAsset[] = [];

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Boot pre-warm — the works-today path</span>')

  @input
  @hint("Synthesize the fixed phrases once at boot so they are instant when first used.")
  private enablePrewarm: boolean = true;

  @input
  @hint("Wait this long after boot before warming, so warm-up never queues ahead of the user's first request.")
  private prewarmStartDelaySec: number = 3;

  @input
  @widget(new SliderWidget(0.0, 10.0, 0.5))
  @hint("Gap AFTER each warm-up call finishes before the next one starts. Strictly one at a time — see the note on prewarmNext().")
  private prewarmGapSec: number = 1.0;

  @input
  @hint("The fixed phrases. Keep these in step with the copy the rest of the HUD uses.")
  @widget(new TextAreaWidget())
  private prewarmPhrases: string[] = [
    "Next step.",
    "Going back.",
    "Got it.",
    "Careful.",
    "Surveying knowledge.",
    "Lesson complete. Well done.",
  ];

  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  /** text -> track. Holds baked and synthesized alike. */
  private cache: { [key: string]: AudioTrackAsset } = {};
  /** Insertion order for eviction. Baked keys are never added here. */
  private cacheOrder: string[] = [];
  /**
   * text -> everyone waiting on a synthesis that is already in flight.
   *
   * This was a boolean, and the second caller for the same words was simply
   * turned away. That is wrong in the two cases that matter most:
   *
   *   - A Q&A answer. `enqueue()` warms the text and then calls `advance()` to
   *     play it. The warm won the race, so advance() was refused, and the track
   *     landed in the cache with nobody to play it — **answers were never
   *     spoken at all**, silently, from the day the queue was written.
   *   - "next" arriving while step n+1's prefetch is still in flight — exactly
   *     the case prefetch exists for. The step went silent.
   *
   * Coalescing instead of refusing fixes both, and still makes only one call.
   */
  private inFlight: { [key: string]: Waiter[] } = {};

  private queue: Utterance[] = [];
  private speaking: boolean = false;
  private currentText: string = "";
  /**
   * Text whose audio the user is waiting on right now. Drives the HUD's
   * "voice incoming" line; empty when nothing is owed.
   */
  private pendingText: string = "";
  /**
   * Bumped whenever the step changes. A synthesis that resolves under an old
   * generation is cached but NOT played — that is the whole defence against
   * hearing step 2 read out while looking at step 4.
   */
  private generation: number = 0;

  private prewarmIndex: number = 0;
  private prewarmTimer: DelayedCallbackEvent;
  private prewarmDeferrals: number = 0;

  onAwake(): void {
    this.prewarmTimer = this.createEvent("DelayedCallbackEvent");
    this.prewarmTimer.bind(() => this.prewarmNext());
    this.prewarmTimer.enabled = false;

    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[TTS] " + msg);
  }

  private onStart(): void {
    if (this.audio) {
      // Narration is a response to something the user just did, so it takes the
      // low-latency path. The power cost is irrelevant next to the 7 s we
      // already spend synthesizing.
      this.audio.playbackMode = Audio.PlaybackMode.LowLatency;
    } else {
      this.log("FAIL: no AudioComponent wired — every utterance will be silent");
    }

    this.loadBaked();

    eventBus.subscribe(Events.narrationRequested, (p: { stepIndex: number; text: string }) => {
      if (!p || !p.text) return;
      this.generation++;
      this.speakNow(p.text, "step" + p.stepIndex);
    });

    eventBus.subscribe(Events.narrationPrefetch, (p: { stepIndex: number; text: string }) => {
      if (!p || !p.text) return;
      this.warm(p.text, "prefetch");
    });

    eventBus.subscribe(Events.speakRequested, (p: { text: string; source: string }) => {
      if (!p || !p.text) return;
      this.enqueue(p.text, p ? p.source : "queued");
    });

    // A new lesson or a stop makes every queued utterance stale.
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      if (!p) return;
      if (p.to === "IDLE" || p.to === "SURVEY") {
        this.generation++;
        this.queue = [];
        this.stopAudio();
      }
    });

    if (this.enablePrewarm && this.prewarmPhrases && this.prewarmPhrases.length > 0) {
      this.prewarmTimer.enabled = true;
      this.prewarmTimer.reset(this.prewarmStartDelaySec);
    }

    this.log(
      "ready. voice=" + this.voice + " baked=" + this.bakedCount() +
        " prewarm=" + (this.enablePrewarm ? this.prewarmPhrases.length + " phrases" : "off")
    );
  }

  /** Baked clips go in first so a live warm-up never overwrites a free one. */
  private loadBaked(): void {
    if (!this.bakedPhrases || !this.bakedTracks) return;
    const n = Math.min(this.bakedPhrases.length, this.bakedTracks.length);
    if (this.bakedPhrases.length !== this.bakedTracks.length) {
      this.log(
        "WARNING: bakedPhrases (" + this.bakedPhrases.length + ") and bakedTracks (" +
          this.bakedTracks.length + ") differ in length; using the first " + n
      );
    }
    for (let i = 0; i < n; i++) {
      const key = normalize(this.bakedPhrases[i]);
      if (key.length > 0 && this.bakedTracks[i]) this.cache[key] = this.bakedTracks[i];
    }
  }

  private bakedCount(): number {
    if (!this.bakedPhrases || !this.bakedTracks) return 0;
    return Math.min(this.bakedPhrases.length, this.bakedTracks.length);
  }

  // -------------------------------------------------------------- public API

  /** Interrupt whatever is playing and say this. Used for step narration. */
  public speakNow(text: string, source: string): void {
    this.queue = [];
    const key = normalize(text);
    const cached = this.cache[key];
    if (cached) {
      this.log('cache HIT "' + preview(text) + '" — instant');
      this.play(cached, text, source);
      return;
    }
    this.log('cache MISS "' + preview(text) + '" — synthesizing');
    // The user is now owed a voice line. Say so on the HUD immediately: the
    // instruction is already readable, and silence with no explanation is the
    // thing that reads as a failure.
    this.setPending(text);
    this.emitVoiceState("", source);
    const gen = this.generation;
    this.synthesize(
      text,
      (track) => {
        if (gen !== this.generation) {
          this.log('discarding late audio for "' + preview(text) + '" (step moved on)');
          return;
        }
        this.play(track, text, source);
      },
      () => {
        if (gen !== this.generation) return;
        this.setPending("");
        this.emitVoiceState("", source);
      },
      GW_NARRATION
    );
  }

  /** Say this once nothing else is speaking. Used for Q&A answers. */
  public enqueue(text: string, source: string): void {
    this.queue.push({ text: text, source: source });
    this.log('queued "' + preview(text) + '" (' + this.queue.length + " waiting)");
    // Warm it now so it is ready the moment the current utterance ends. This is
    // an answer the user asked for, so it warms at narration priority, not as
    // background work.
    this.warm(text, "queued", GW_NARRATION);
    if (!this.speaking) this.advance();
  }

  /**
   * Synthesize into the cache without playing. Never throws, never blocks.
   * Defaults to GW_BACKGROUND: a prefetch is by definition something nobody is
   * waiting for, so it must never take the gateway slot ahead of work that is.
   */
  public warm(text: string, source: string, priority?: number): void {
    this.warmThen(text, source, null, priority);
  }

  /** warm(), plus a callback that fires whether it succeeded or failed. */
  private warmThen(
    text: string,
    source: string,
    done: (() => void) | null,
    priority?: number
  ): void {
    const key = normalize(text);
    if (key.length === 0 || this.cache[key]) {
      if (done) done();
      return;
    }
    this.synthesize(
      text,
      () => {
        this.log('warmed "' + preview(text) + '" (' + source + ")");
        if (done) done();
      },
      done ? done : undefined,
      typeof priority === "number" ? priority : GW_BACKGROUND
    );
  }

  // --------------------------------------------------------------- internals

  private synthesize(
    text: string,
    onReady: (track: AudioTrackAsset) => void,
    onFailed?: () => void,
    priority?: number
  ): void {
    const key = normalize(text);
    if (key.length === 0) {
      if (onFailed) onFailed();
      return;
    }

    const cached = this.cache[key];
    if (cached) {
      onReady(cached);
      return;
    }
    const waiting = this.inFlight[key];
    if (waiting) {
      // Someone is already asking for these words. Wait for THAT call rather
      // than being turned away — see the note on inFlight.
      waiting.push({ onReady: onReady, onFailed: onFailed });
      this.log('joining in-flight synthesis for "' + preview(text) + '" (' + waiting.length + " waiting)");
      return;
    }
    this.inFlight[key] = [{ onReady: onReady, onFailed: onFailed }];

    let t0 = getTime();
    let settled = false;
    const tier = typeof priority === "number" ? priority : GW_BACKGROUND;

    // Watchdog: a synthesis that never resolves must not pin the in-flight flag
    // forever, or that phrase can never be retried for the rest of the session.
    //
    // It starts on DISPATCH, not here. Now that requests queue, a job can sit
    // waiting for the slot longer than the timeout itself, and a watchdog armed
    // at submission would report a network timeout for a call that had not been
    // made yet.
    const watchdog = this.createEvent("DelayedCallbackEvent");
    watchdog.bind(() => {
      if (settled) return;
      settled = true;
      const waiters = this.takeWaiters(key);
      this.log('TIMEOUT after ' + this.synthesisTimeoutSec + 's for "' + preview(text) + '" — staying silent');
      for (let i = 0; i < waiters.length; i++) {
        const f = waiters[i].onFailed;
        if (f) f();
      }
    });
    watchdog.enabled = false;

    gatewaySubmit({
      label: "tts:" + (tier === GW_NARRATION ? "now" : "warm"),
      priority: tier,
      onDispatch: () => {
        t0 = getTime();
        watchdog.enabled = true;
        watchdog.reset(this.synthesisTimeoutSec);
      },
      run: () => OpenAI.speech({ model: OPENAI_TTS_MODEL, input: text, voice: this.voice }),
    })
      .then((track: AudioTrackAsset) => {
        watchdog.enabled = false;
        if (settled) return;
        settled = true;
        const waiters = this.takeWaiters(key);
        const ms = Math.round((getTime() - t0) * 1000);
        this.log(
          'synthesized ' + ms + 'ms "' + preview(text) + '"' +
            (waiters.length > 1 ? " (" + waiters.length + " waiting)" : "")
        );
        this.store(key, track);
        for (let i = 0; i < waiters.length; i++) waiters[i].onReady(track);
      })
      .catch((error) => {
        watchdog.enabled = false;
        if (settled) return;
        settled = true;
        const waiters = this.takeWaiters(key);
        const ms = Math.round((getTime() - t0) * 1000);
        if (gatewayWasDropped(error)) {
          // We dropped it on purpose to clear the way for the user. Not a fault.
          this.log('skipped "' + preview(text) + '" — queue cleared for a user request');
        } else {
          // Degrade to silence. The instruction is already on the guide panel;
          // a lesson that stops because a voice failed would be a worse product.
          this.log('FAILED after ' + ms + 'ms "' + preview(text) + '": ' + error + " — degrading to silent text");
        }
        for (let i = 0; i < waiters.length; i++) {
          const f = waiters[i].onFailed;
          if (f) f();
        }
      });
  }

  /** Detach and return everyone waiting on this key. */
  private takeWaiters(key: string): Waiter[] {
    const waiters = this.inFlight[key];
    delete this.inFlight[key];
    return waiters ? waiters : [];
  }

  private store(key: string, track: AudioTrackAsset): void {
    this.cache[key] = track;
    this.cacheOrder.push(key);
    while (this.cacheOrder.length > Math.max(1, this.maxCacheEntries)) {
      const oldest = this.cacheOrder.shift();
      // Never evict a baked clip: it is free to keep and expensive to lose.
      if (oldest && !this.isBaked(oldest)) delete this.cache[oldest];
    }
  }

  private isBaked(key: string): boolean {
    if (!this.bakedPhrases) return false;
    for (let i = 0; i < this.bakedPhrases.length; i++) {
      if (normalize(this.bakedPhrases[i]) === key) return true;
    }
    return false;
  }

  private play(track: AudioTrackAsset, text: string, source: string): void {
    if (!this.audio || !track) return;
    this.safeStop();
    this.audio.audioTrack = track;
    try {
      this.audio.play(1);
    } catch (e) {
      // Player disabled (HUD hidden). Stay silent rather than throwing into the bus.
      this.log('cannot play "' + preview(text) + '" — audio player not enabled');
      this.setPending("");
      this.emitVoiceState("", source);
      return;
    }
    this.speaking = true;
    this.currentText = text;
    this.setPending("");
    this.emitVoiceState(text, source);
    this.log('speaking (' + source + ') "' + preview(text) + '"');
  }

  private stopAudio(): void {
    this.safeStop();
    if (this.speaking) {
      this.speaking = false;
      this.currentText = "";
    }
    this.setPending("");
    this.emitVoiceState("", "");
  }

  /**
   * `audio.stop()` throws "[AudioComponent] Audio player is not enabled" when
   * the component's object is disabled — which is exactly what ModeRouter does
   * to HUDRoot on the SURVEY/IDLE transitions that call stopAudio(). The throw
   * used to escape into the EventBus on every one of those transitions. There
   * is nothing to recover from: not playing is the state we were asking for.
   */
  private safeStop(): void {
    if (!this.audio) return;
    try {
      this.audio.stop(true);
    } catch (e) {
      // Already silent because the player is disabled. Nothing to do.
    }
  }

  /** One place that publishes voice state, so `pending` can never drift. */
  private emitVoiceState(text: string, source: string): void {
    eventBus.emit(Events.narrationStateChanged, {
      speaking: this.speaking,
      pending: this.pendingText.length > 0,
      pendingText: this.pendingText,
      text: text,
      source: source,
    });
  }

  private setPending(text: string): void {
    this.pendingText = text || "";
  }

  private advance(): void {
    const next = this.queue.shift();
    if (!next) return;
    const key = normalize(next.text);
    const cached = this.cache[key];
    if (cached) {
      this.play(cached, next.text, next.source);
      return;
    }
    const gen = this.generation;
    this.setPending(next.text);
    this.emitVoiceState("", next.source);
    this.synthesize(
      next.text,
      (track) => {
        if (gen !== this.generation) return;
        if (!this.speaking) this.play(track, next.text, next.source);
        else this.queue.unshift(next); // something started while we waited
      },
      () => {
        if (gen !== this.generation) return;
        this.setPending("");
        this.emitVoiceState("", next.source);
      },
      GW_NARRATION
    );
  }

  private onUpdate(): void {
    if (!this.speaking || !this.audio) return;
    if (this.audio.isPlaying()) return;
    // Playback ended.
    this.speaking = false;
    const finished = this.currentText;
    this.currentText = "";
    this.emitVoiceState(finished, "");
    if (this.queue.length > 0) this.advance();
  }

  // --------------------------------------------------------------- pre-warm

  /**
   * ONE AT A TIME, chained on completion — not on a timer.
   *
   * The first version fired the next warm-up every prewarmGapSec regardless of
   * whether the previous had returned. Since each call takes 7-18 s, that put
   * six TTS requests in flight at once, and the measured result was ugly: DNS
   * resolution failures, "Network is unreachable", a 15 s outlier on an
   * unrelated Gemini call running at the same time, and three of the six
   * phrases failing outright. Concurrent RSG calls do not queue politely — they
   * degrade each other. Nothing is waiting on a warm-up, so it has no business
   * competing with anything.
   */
  private prewarmNext(): void {
    if (this.prewarmIndex >= this.prewarmPhrases.length) {
      this.log("pre-warm complete: " + this.cacheSize() + " phrases cached");
      return;
    }
    const phrase = this.prewarmPhrases[this.prewarmIndex];
    this.prewarmIndex++;

    const scheduleNext = () => {
      this.prewarmTimer.enabled = true;
      this.prewarmTimer.reset(this.prewarmGapSec);
    };

    // Warm only into genuine idle. Warm-ups queue at GW_BACKGROUND so they can
    // never overtake anything, but a warm-up already HOLDING the slot delays
    // whatever comes next by its full 6-18 s — and the queue cannot cancel a
    // call already on the wire. Not starting is the only version of "get out of
    // the way" that actually works.
    if (!gatewayIdle()) {
      this.prewarmIndex--; // put the phrase back; nothing was spent on it
      this.prewarmDeferrals++;
      if (this.prewarmDeferrals % 5 === 1) this.log("pre-warm yielding — the gateway is busy");
      this.prewarmTimer.enabled = true;
      this.prewarmTimer.reset(Math.max(1.0, this.prewarmGapSec));
      return;
    }

    if (!phrase || phrase.length === 0) {
      scheduleNext();
      return;
    }
    this.warmThen(phrase, "prewarm", scheduleNext, GW_BACKGROUND);
  }

  /** Diagnostics only. */
  public cacheSize(): number {
    return Object.keys(this.cache).length;
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }
}

/** Cache key: case and surrounding whitespace must not split an entry in two. */
function normalize(text: string): string {
  return (text || "").trim().toLowerCase();
}

function preview(text: string): string {
  const t = text || "";
  return t.length <= 42 ? t : t.substring(0, 40) + "…";
}
