/**
 * GatewayQueue — ONE Remote Service Gateway request in flight, app-wide.
 *
 * ## Why this exists
 *
 * Measured, not assumed. When the first pre-warm implementation fired six TTS
 * calls on a timer instead of chaining them, the result was not "six calls that
 * each took a bit longer" — it was `DNS resolution failed for
 * gcp.api.snapchat.com`, `Network is unreachable`, three of six phrases failing
 * outright, and an 18.6 s outlier on an *unrelated* Gemini call that happened to
 * be running alongside. Concurrent gateway requests do not queue politely. They
 * degrade each other, and the damage lands on whichever call the user is
 * actually waiting for.
 *
 * Chaining fixed it inside the warm-up loop. This file is that same fix applied
 * where it actually belongs: every call this app makes to the gateway, from
 * every subsystem, through one door. A step-n+1 prefetch cannot overlap a
 * step-n synthesis, and neither can overlap a lesson request, because there is
 * exactly one slot and everything queues for it.
 *
 * ## Priority, because "sequential" alone would be worse
 *
 * Strict FIFO would let a background warm-up sit ahead of the lesson the user
 * just asked for. Pending work is therefore ordered by priority first, arrival
 * second:
 *
 *   GW_USER (0)        a lesson request or a Q&A answer — someone is waiting
 *   GW_NARRATION (1)   the current step's voice — wanted now, but the text is
 *                      already on screen without it
 *   GW_BACKGROUND (2)  prefetch and boot warm-ups — nothing is waiting
 *
 * Priority reorders the *queue*; it never interrupts the slot. An in-flight
 * request cannot be cancelled (promises are not cancellable, and the socket is
 * already open), so the worst case is one call's wait — which is exactly the
 * cost of not corrupting all of them.
 *
 * ## The stall guard is not optional
 *
 * A single promise that never settles would wedge every voice line and every
 * lesson for the rest of the session — a far worse failure than the concurrency
 * it replaced. Each dispatch is therefore timed, and a job that overruns is
 * abandoned: its caller is rejected and the slot moves on. The abandoned
 * promise may still land later; nobody is listening by then.
 *
 * A plain module, no component, no scene dependency — so Engine code can import
 * it without anything being wired in the Inspector.
 */

/** Someone is waiting on screen: lesson requests, Q&A answers. */
export const GW_USER = 0;
/** The current step's narration. Wanted now; the step is readable without it. */
export const GW_NARRATION = 1;
/** Prefetch and boot warm-ups. Nothing is waiting on these. */
export const GW_BACKGROUND = 2;

export interface GatewayJobOptions<T> {
  /** Short label for the log. "lesson", "qa", "tts:step2", "tts:prewarm". */
  label: string;
  /** GW_USER / GW_NARRATION / GW_BACKGROUND. */
  priority: number;
  /** The actual gateway call. Invoked only when the slot is free. */
  run: () => Promise<T>;
  /**
   * Fires the moment this job takes the slot, with how long it waited.
   * Callers use it to start their own timeout from DISPATCH rather than from
   * submission — otherwise a 20 s synthesis watchdog can expire while the job
   * is still sitting in the queue, and blame the network for our own queuing.
   */
  onDispatch?: (queuedMs: number) => void;
}

interface Job {
  label: string;
  priority: number;
  seq: number;
  submittedAt: number;
  run: () => Promise<any>;
  onDispatch?: (queuedMs: number) => void;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

/** Marker prefix so callers can tell "we dropped this" from "the network failed". */
const DROPPED = "gateway-dropped: ";
const STALLED = "gateway-stalled: ";

let pending: Job[] = [];
let active: Job | null = null;
let seqCounter = 0;
let stallTimer: number | null = null;
let loggingEnabled = true;

/**
 * Longer than every caller-side timeout (lesson 25 s, synthesis 20 s) on
 * purpose: this is the guard against a promise that never settles at all, not a
 * second opinion on slowness. The caller's own watchdog should always fire first.
 */
let stallTimeoutSec = 45;

function nowMs(): number {
  return getTime() * 1000;
}

function log(msg: string): void {
  if (loggingEnabled) print("[GW] " + msg);
}

/** Diagnostics knob; the default is right for the demo. */
export function gatewayConfigure(opts: { stallTimeoutSec?: number; logging?: boolean }): void {
  if (!opts) return;
  if (typeof opts.stallTimeoutSec === "number") stallTimeoutSec = opts.stallTimeoutSec;
  if (typeof opts.logging === "boolean") loggingEnabled = opts.logging;
}

/**
 * THE door to the gateway. Nothing in this app should call Gemini or OpenAI
 * outside of this function.
 */
export function gatewaySubmit<T>(opts: GatewayJobOptions<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: Job = {
      label: opts.label,
      priority: opts.priority,
      seq: seqCounter++,
      submittedAt: nowMs(),
      run: opts.run,
      onDispatch: opts.onDispatch,
      resolve: resolve,
      reject: reject,
    };
    pending.push(job);
    if (active) {
      log(
        'queued "' + job.label + '" p' + job.priority + " behind \"" + active.label +
          '" (' + pending.length + " waiting)"
      );
    }
    pump();
  });
}

/** Lowest priority number first; within a tier, whoever asked first. */
function takeNext(): Job | null {
  if (pending.length === 0) return null;
  let bestIndex = 0;
  for (let i = 1; i < pending.length; i++) {
    const a = pending[i];
    const b = pending[bestIndex];
    if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) bestIndex = i;
  }
  return pending.splice(bestIndex, 1)[0];
}

function pump(): void {
  if (active) return;
  const job = takeNext();
  if (!job) return;

  active = job;
  const queuedMs = Math.round(nowMs() - job.submittedAt);
  const startedAt = nowMs();
  let settled = false;

  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    active = null;
    fn();
    // Next job starts only after this one has fully settled — that is the
    // whole guarantee, and it is why pump() is called here and nowhere else
    // except submission.
    pump();
  };

  log(
    'dispatch "' + job.label + '" p' + job.priority +
      (queuedMs > 20 ? " (waited " + queuedMs + "ms)" : "") +
      (pending.length > 0 ? " [" + pending.length + " still queued]" : "")
  );

  stallTimer = setTimeout(() => {
    stallTimer = null;
    finish(() => {
      log('STALLED "' + job.label + '" — abandoned after ' + stallTimeoutSec + "s, slot released");
      job.reject(new Error(STALLED + job.label));
    });
  }, stallTimeoutSec * 1000);

  if (job.onDispatch) {
    try {
      job.onDispatch(queuedMs);
    } catch (e) {
      log('onDispatch threw for "' + job.label + '": ' + e);
    }
  }

  let promise: Promise<any>;
  try {
    promise = job.run();
  } catch (e) {
    // A synchronous throw must not keep the slot.
    finish(() => job.reject(e));
    return;
  }

  promise.then(
    (value) => {
      const ms = Math.round(nowMs() - startedAt);
      finish(() => {
        log('done "' + job.label + '" ' + ms + "ms");
        job.resolve(value);
      });
    },
    (error) => {
      const ms = Math.round(nowMs() - startedAt);
      finish(() => {
        log('failed "' + job.label + '" after ' + ms + "ms: " + error);
        job.reject(error);
      });
    }
  );
}

/**
 * Drop queued work at or below `minPriority` (i.e. numerically >=).
 * Used when a user request arrives and a pile of warm-ups is in its way. The
 * in-flight job is never touched — see the header.
 */
export function gatewayDropPending(minPriority: number, reason: string): number {
  const kept: Job[] = [];
  const dropped: Job[] = [];
  for (let i = 0; i < pending.length; i++) {
    if (pending[i].priority >= minPriority) dropped.push(pending[i]);
    else kept.push(pending[i]);
  }
  pending = kept;
  for (let i = 0; i < dropped.length; i++) {
    log('dropping queued "' + dropped[i].label + '" — ' + reason);
    dropped[i].reject(new Error(DROPPED + dropped[i].label));
  }
  return dropped.length;
}

/** True when a rejection came from gatewayDropPending, not from the network. */
export function gatewayWasDropped(error: any): boolean {
  return String(error).indexOf(DROPPED) >= 0;
}

/**
 * True when anything the user is waiting on is in flight or queued.
 * Background work asks this before adding to the pile.
 */
export function gatewayHasUserWork(): boolean {
  if (active && active.priority <= GW_USER) return true;
  for (let i = 0; i < pending.length; i++) {
    if (pending[i].priority <= GW_USER) return true;
  }
  return false;
}

export function gatewayBusy(): boolean {
  return active !== null;
}

/**
 * Nothing in flight and nothing waiting.
 *
 * This, not gatewayHasUserWork(), is the bar background work has to clear
 * before it starts. Yielding only to GW_USER would still let a boot warm-up
 * take the slot in front of the step narration the user is waiting to hear —
 * queued politely, and still 6-18 s late. Warm-ups exist to use idle time, so
 * idle is what they wait for.
 */
export function gatewayIdle(): boolean {
  return active === null && pending.length === 0;
}

/** Diagnostics only: what is happening right now, for a log line. */
export function gatewayStatus(): string {
  return (active ? 'active="' + active.label + '"' : "idle") + " queued=" + pending.length;
}
