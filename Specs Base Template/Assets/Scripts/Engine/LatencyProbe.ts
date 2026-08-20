/**
 * THROWAWAY DIAGNOSTIC — where does the fixed ~7 s per call go, and would a
 * boot-time warm-up call remove it?
 *
 * Every remote call this project makes pays a floor that has nothing to do with
 * payload size: ~7.4 s for a three-token Gemini reply, ~7.5 s for one spoken
 * word of TTS. This measures the floor rather than guessing at it.
 *
 * Three phases, run once, in order:
 *
 *   A. RAW HTTPS to a host outside the gateway, three times. Separates
 *      "the device cannot reach the internet quickly" from "the gateway and the
 *      model are slow". If request 1 is slow and 2-3 are fast, that gap is TLS
 *      and connection setup; if all three are fast, the floor is NOT the
 *      network and the remaining time is gateway + model.
 *   B. The SAME minimal Gemini call four times. This is the hypothesis test:
 *      if call 1 is materially slower than calls 2-4, a throwaway warm-up at
 *      boot would absorb that difference and is worth keeping. If all four
 *      match, warming buys nothing and the floor is per-call, not per-session.
 *   C. The same one-word TTS call three times, to check the answer holds for
 *      the other provider rather than being a Gemini quirk.
 *
 * Deliberately boring: identical payloads, sequential, no parallelism to muddy
 * the numbers. Timeboxed by design — it answers one question and stops.
 */
import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
import { GeminiTypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";
import { OpenAI } from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI";
import { GEMINI_MODEL, OPENAI_TTS_MODEL } from "./RsgModels";

@component
export class LatencyProbe extends BaseScriptComponent {
  @input private runOnStart: boolean = false;

  @input
  @hint("A tiny endpoint outside the RSG gateway. 204 No Content: the response body cannot dominate the timing.")
  private netUrl: string = "https://www.google.com/generate_204";

  @input private netSamples: number = 3;
  @input private geminiSamples: number = 4;
  @input private ttsSamples: number = 3;

  private internet: InternetModule = require("LensStudio:InternetModule");
  private netTimes: number[] = [];
  private geminiTimes: number[] = [];
  private ttsTimes: number[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      if (this.runOnStart) this.run();
    });
  }

  private log(msg: string): void {
    print("[LAT] " + msg);
  }

  private nowMs(): number {
    return getTime() * 1000;
  }

  private run(): void {
    this.log("=== fixed-cost investigation ===");
    this.log("A. raw HTTPS x" + this.netSamples + " -> B. minimal Gemini x" + this.geminiSamples + " -> C. one-word TTS x" + this.ttsSamples);
    this.netRound(0);
  }

  // ------------------------------------------------- A. raw network floor

  private netRound(i: number): void {
    if (i >= this.netSamples) {
      this.log("A. raw HTTPS: " + fmt(this.netTimes) + "  " + spread(this.netTimes));
      this.geminiRound(0);
      return;
    }
    const t0 = this.nowMs();
    this.internet
      .fetch(this.netUrl)
      .then((response: any) => {
        const ms = Math.round(this.nowMs() - t0);
        this.netTimes.push(ms);
        this.log("  A" + (i + 1) + " raw HTTPS " + ms + "ms (status " + response.status + ")");
        this.netRound(i + 1);
      })
      .catch((e) => {
        this.log("  A" + (i + 1) + " raw HTTPS FAILED: " + e);
        this.netRound(i + 1);
      });
  }

  // ------------------------------------------- B. the warm-up hypothesis

  private geminiRound(i: number): void {
    if (i >= this.geminiSamples) {
      this.log("B. minimal Gemini: " + fmt(this.geminiTimes) + "  " + spread(this.geminiTimes));
      this.verdict();
      this.ttsRound(0);
      return;
    }
    const request: GeminiTypes.Models.GenerateContentRequest = {
      model: GEMINI_MODEL,
      type: "generateContent",
      body: {
        contents: [{ parts: [{ text: "Reply with the single word: ok" }], role: "user" }],
        generationConfig: { temperature: 0, maxOutputTokens: 5 },
      },
    };
    const t0 = this.nowMs();
    Gemini.models(request)
      .then(() => {
        const ms = Math.round(this.nowMs() - t0);
        this.geminiTimes.push(ms);
        this.log("  B" + (i + 1) + " minimal Gemini " + ms + "ms");
        this.geminiRound(i + 1);
      })
      .catch((e) => {
        this.log("  B" + (i + 1) + " minimal Gemini FAILED: " + e);
        this.geminiRound(i + 1);
      });
  }

  // --------------------------------------------------- C. the same for TTS

  private ttsRound(i: number): void {
    if (i >= this.ttsSamples) {
      this.log("C. one-word TTS: " + fmt(this.ttsTimes) + "  " + spread(this.ttsTimes));
      this.log("=== investigation complete ===");
      return;
    }
    const t0 = this.nowMs();
    OpenAI.speech({ model: OPENAI_TTS_MODEL, input: "online", voice: "coral" })
      .then(() => {
        const ms = Math.round(this.nowMs() - t0);
        this.ttsTimes.push(ms);
        this.log("  C" + (i + 1) + " one-word TTS " + ms + "ms");
        this.ttsRound(i + 1);
      })
      .catch((e) => {
        this.log("  C" + (i + 1) + " one-word TTS FAILED: " + e);
        this.ttsRound(i + 1);
      });
  }

  /**
   * The whole point of the exercise, stated in one line so the answer cannot be
   * lost in the numbers above it.
   */
  private verdict(): void {
    if (this.geminiTimes.length < 2) {
      this.log("VERDICT: not enough samples");
      return;
    }
    const first = this.geminiTimes[0];
    let restSum = 0;
    for (let i = 1; i < this.geminiTimes.length; i++) restSum += this.geminiTimes[i];
    const rest = restSum / (this.geminiTimes.length - 1);
    const saved = first - rest;
    const pct = rest > 0 ? Math.round((saved / first) * 100) : 0;
    this.log(
      "VERDICT: first call " + first + "ms vs later calls " + Math.round(rest) + "ms avg -> a warm-up would save " +
        Math.round(saved) + "ms (" + pct + "%). " +
        (saved > 1500
          ? "WORTH KEEPING: warm at boot."
          : "NOT WORTH IT: the floor is per-call, not per-session.")
    );
  }
}

function fmt(times: number[]): string {
  if (times.length === 0) return "no samples";
  const parts: string[] = [];
  for (let i = 0; i < times.length; i++) parts.push(times[i] + "ms");
  return parts.join(", ");
}

function spread(times: number[]): string {
  if (times.length === 0) return "";
  let min = times[0];
  let max = times[0];
  let sum = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] < min) min = times[i];
    if (times[i] > max) max = times[i];
    sum += times[i];
  }
  return "[min " + min + " avg " + Math.round(sum / times.length) + " max " + max + "]";
}
