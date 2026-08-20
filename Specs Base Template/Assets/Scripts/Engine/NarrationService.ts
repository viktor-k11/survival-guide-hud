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
 */
import { eventBus, Events } from "./EventBus";
import { OpenAI } from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI";
import { OPENAI_TTS_MODEL } from "./RsgModels";

interface Utterance {
  text: string;
  source: string;
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
  /** text -> true while a synthesis is in flight, so we never ask twice. */
  private inFlight: { [key: string]: boolean } = {};

  private queue: Utterance[] = [];
  private speaking: boolean = false;
  private currentText: string = "";
  /**
   * Bumped whenever the step changes. A synthesis that resolves under an old
   * generation is cached but NOT played — that is the whole defence against
   * hearing step 2 read out while looking at step 4.
   */
  private generation: number = 0;

  private prewarmIndex: number = 0;
  private prewarmTimer: DelayedCallbackEvent;

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
    const gen = this.generation;
    this.synthesize(text, (track) => {
      if (gen !== this.generation) {
        this.log('discarding late audio for "' + preview(text) + '" (step moved on)');
        return;
      }
      this.play(track, text, source);
    });
  }

  /** Say this once nothing else is speaking. Used for Q&A answers. */
  public enqueue(text: string, source: string): void {
    this.queue.push({ text: text, source: source });
    this.log('queued "' + preview(text) + '" (' + this.queue.length + " waiting)");
    // Warm it now so it is ready the moment the current utterance ends.
    this.warm(text, "queued");
    if (!this.speaking) this.advance();
  }

  /** Synthesize into the cache without playing. Never throws, never blocks. */
  public warm(text: string, source: string): void {
    this.warmThen(text, source, null);
  }

  /** warm(), plus a callback that fires whether it succeeded or failed. */
  private warmThen(text: string, source: string, done: (() => void) | null): void {
    const key = normalize(text);
    if (key.length === 0 || this.cache[key] || this.inFlight[key]) {
      if (done) done();
      return;
    }
    this.synthesize(
      text,
      () => {
        this.log('warmed "' + preview(text) + '" (' + source + ")");
        if (done) done();
      },
      done ? done : undefined
    );
  }

  // --------------------------------------------------------------- internals

  private synthesize(
    text: string,
    onReady: (track: AudioTrackAsset) => void,
    onFailed?: () => void
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
    if (this.inFlight[key]) {
      if (onFailed) onFailed();
      return; // someone is already asking for these words
    }
    this.inFlight[key] = true;

    const t0 = getTime();
    let settled = false;

    // Watchdog: a synthesis that never resolves must not pin the in-flight flag
    // forever, or that phrase can never be retried for the rest of the session.
    const watchdog = this.createEvent("DelayedCallbackEvent");
    watchdog.bind(() => {
      if (settled) return;
      settled = true;
      delete this.inFlight[key];
      this.log('TIMEOUT after ' + this.synthesisTimeoutSec + 's for "' + preview(text) + '" — staying silent');
      if (onFailed) onFailed();
    });
    watchdog.reset(this.synthesisTimeoutSec);

    OpenAI.speech({ model: OPENAI_TTS_MODEL, input: text, voice: this.voice })
      .then((track: AudioTrackAsset) => {
        watchdog.enabled = false;
        if (settled) return;
        settled = true;
        delete this.inFlight[key];
        const ms = Math.round((getTime() - t0) * 1000);
        this.log('synthesized ' + ms + 'ms "' + preview(text) + '"');
        this.store(key, track);
        onReady(track);
      })
      .catch((error) => {
        watchdog.enabled = false;
        if (settled) return;
        settled = true;
        delete this.inFlight[key];
        const ms = Math.round((getTime() - t0) * 1000);
        // Degrade to silence. The instruction is already on the guide panel;
        // a lesson that stops because a voice failed would be a worse product.
        this.log('FAILED after ' + ms + 'ms "' + preview(text) + '": ' + error + " — degrading to silent text");
        if (onFailed) onFailed();
      });
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
    this.audio.stop(true);
    this.audio.audioTrack = track;
    this.audio.play(1);
    this.speaking = true;
    this.currentText = text;
    eventBus.emit(Events.narrationStateChanged, { speaking: true, text: text, source: source });
    this.log('speaking (' + source + ') "' + preview(text) + '"');
  }

  private stopAudio(): void {
    if (this.audio) this.audio.stop(true);
    if (this.speaking) {
      this.speaking = false;
      this.currentText = "";
      eventBus.emit(Events.narrationStateChanged, { speaking: false, text: "", source: "" });
    }
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
    this.synthesize(next.text, (track) => {
      if (gen !== this.generation) return;
      if (!this.speaking) this.play(track, next.text, next.source);
      else this.queue.unshift(next); // something started while we waited
    });
  }

  private onUpdate(): void {
    if (!this.speaking || !this.audio) return;
    if (this.audio.isPlaying()) return;
    // Playback ended.
    this.speaking = false;
    const finished = this.currentText;
    this.currentText = "";
    eventBus.emit(Events.narrationStateChanged, { speaking: false, text: finished, source: "" });
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

    if (!phrase || phrase.length === 0) {
      scheduleNext();
      return;
    }
    this.warmThen(phrase, "prewarm", scheduleNext);
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
