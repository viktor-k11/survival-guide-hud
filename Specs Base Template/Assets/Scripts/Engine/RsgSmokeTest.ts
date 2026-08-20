/**
 * THROWAWAY DIAGNOSTIC — delete this file and its SceneObject once RSG is
 * confirmed working. Not architecture: it deliberately ignores the
 * Engine/Widgets split and does its own logging.
 *
 * On boot it runs, in order:
 *   1. [RSG-ENUM]    an enumeration attempt against the RSG Gemini wrapper
 *   2. [RSG-PROBE]   each candidate model, sequentially, stopping at the first
 *                    HTTP 200 — this is how GEMINI_MODEL in RsgModels.ts was chosen
 *   3. [RSG-JSON]    the real test: temperature 0 + responseSchema structured
 *                    output, which is what the lesson planner actually needs
 *   4. [RSG-TTS]     optional, off by default (already passed; ~7.5s per call)
 *
 * Keep RsgModels.ts, RsgTokens.ts and RsgTokenLocal.ts when you delete this —
 * they are the permanent token/model plumbing.
 */
import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
import { GeminiTypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";
import { OpenAI } from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI";
import { RSG_TOKENS } from "./RsgTokenLocal";
import { installRsgTokens, tokenFingerprint } from "./RsgTokens";
import { GEMINI_MODEL, OPENAI_TTS_MODEL } from "./RsgModels";

/** Ordered candidates, probed one call each until one returns 200. */
const CANDIDATES: string[] = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-001",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash-002",
  "gemini-2.5-pro",
];

/** Set true to re-measure TTS latency. Off by default: ~7.5s and already green. */
const RUN_TTS = false;

/** Set true to re-run the candidate sweep. Off once GEMINI_MODEL is pinned. */
const RUN_PROBE = true;

@component
export class RsgSmokeTest extends BaseScriptComponent {
  private audio: AudioComponent;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.run());
  }

  private nowMs(): number {
    return getTime() * 1000;
  }

  private run(): void {
    installRsgTokens();
    print(
      "[RSG-SMOKE] tokens installed" +
        " google=" + tokenFingerprint(RSG_TOKENS.google) +
        " openAI=" + tokenFingerprint(RSG_TOKENS.openAI) +
        " snap=" + tokenFingerprint(RSG_TOKENS.snap)
    );

    this.audio = this.sceneObject.getComponent("Component.AudioComponent");

    this.tryEnumerate()
      .then(() => (RUN_PROBE ? this.probeAll() : Promise.resolve(GEMINI_MODEL)))
      .then((winner: string) => {
        if (!winner) {
          print("[RSG-PROBE] no candidate succeeded — structured test skipped");
          return;
        }
        return this.structuredTest(winner);
      })
      .then(() => {
        if (RUN_TTS) this.testTts();
      });
  }

  // ---------------------------------------------------------------- 1. enumerate

  /**
   * The RSG wrapper hardcodes endpoint "models" and forwards `type` as the verb,
   * so a models.list-style call is only possible if the gateway accepts a "list"
   * verb. Try it; whatever comes back is reported, then we fall through to the
   * candidate sweep either way.
   */
  private tryEnumerate(): Promise<void> {
    const t0 = this.nowMs();
    print("[RSG-ENUM] attempting models.list via type=\"list\"");
    return Gemini.models({ model: "", type: "list", body: { contents: [] } } as any)
      .then((response) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-ENUM] SUPPORTED latency=" + ms + "ms raw=" + JSON.stringify(response));
      })
      .catch((error) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-ENUM] NOT SUPPORTED latency=" + ms + "ms error=" + error);
      });
  }

  // ------------------------------------------------------------------ 2. probe

  /** Sequentially probe candidates; resolve with the first that returns 200. */
  private probeAll(): Promise<string> {
    let chain: Promise<string> = Promise.resolve("");
    for (let i = 0; i < CANDIDATES.length; i++) {
      const model = CANDIDATES[i];
      chain = chain.then((winner: string) => {
        if (winner) {
          print("[RSG-PROBE] " + model + " SKIPPED (already found " + winner + ")");
          return winner;
        }
        return this.probeOne(model);
      });
    }
    return chain.then((winner: string) => {
      print("[RSG-PROBE] sweep complete winner=" + (winner || "<none>"));
      return winner;
    });
  }

  private probeOne(model: string): Promise<string> {
    const t0 = this.nowMs();
    const request: GeminiTypes.Models.GenerateContentRequest = {
      model: model,
      type: "generateContent",
      body: { contents: [{ parts: [{ text: "reply: alive" }], role: "user" }] },
    };
    return Gemini.models(request)
      .then((response) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-PROBE] " + model + " HTTP 200 latency=" + ms + "ms");
        print("[RSG-PROBE] " + model + " raw=" + JSON.stringify(response));
        return model;
      })
      .catch((error) => {
        const ms = Math.round(this.nowMs() - t0);
        const body = String(error);
        let code = "unknown";
        const m = body.match(/"code"\s*:\s*(\d+)/);
        if (m) code = m[1];
        print("[RSG-PROBE] " + model + " HTTP " + code + " latency=" + ms + "ms error=" + body);
        return "";
      });
  }

  // ------------------------------------------------------------- 3. structured

  /**
   * The test that actually matters: temperature 0 + a response schema, which is
   * how the lesson planner will call Gemini. Verifies the reply is bare JSON
   * matching the schema — no markdown fence, no prose.
   */
  private structuredTest(model: string): Promise<void> {
    const schema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        steps: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { instruction: { type: "STRING" } },
            required: ["instruction"],
          },
        },
      },
      required: ["title", "steps"],
    };

    const request: GeminiTypes.Models.GenerateContentRequest = {
      model: model,
      type: "generateContent",
      body: {
        contents: [{ parts: [{ text: "campfire in 3 steps" }], role: "user" }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: schema as any,
        },
      },
    };

    const t0 = this.nowMs();
    print("[RSG-JSON] request sent model=" + model + " temperature=0 schema=title+steps[].instruction");

    return Gemini.models(request)
      .then((response) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-JSON] OK latency=" + ms + "ms");
        // Full response object — this is what gets saved as the fixture.
        print("[RSG-JSON-FIXTURE] " + JSON.stringify(response));

        const text = response.candidates[0].content.parts[0].text;
        print("[RSG-JSON] payload verbatim: " + text);
        this.validate(text);
      })
      .catch((error) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-JSON] FAIL latency=" + ms + "ms error=" + error);
      });
  }

  /** Explicitly check for the two failure modes that change our approach. */
  private validate(text: string): void {
    const fenced = text.indexOf("```") >= 0;
    print("[RSG-JSON] markdown fence present: " + fenced);
    const trimmed = text.trim();
    print("[RSG-JSON] starts with '{': " + (trimmed.charAt(0) === "{"));

    let parsed: any = null;
    try {
      parsed = JSON.parse(trimmed);
      print("[RSG-JSON] JSON.parse: OK");
    } catch (e) {
      print("[RSG-JSON] JSON.parse: FAILED " + e);
      return;
    }

    const hasTitle = typeof parsed.title === "string";
    const hasSteps = Array.isArray(parsed.steps);
    let stepsOk = hasSteps;
    if (hasSteps) {
      for (let i = 0; i < parsed.steps.length; i++) {
        if (typeof parsed.steps[i].instruction !== "string") stepsOk = false;
      }
    }
    print(
      "[RSG-JSON] schema match: title=" + hasTitle +
        " steps=" + hasSteps +
        " stepCount=" + (hasSteps ? parsed.steps.length : 0) +
        " allStepsHaveInstruction=" + stepsOk
    );
    const extras = Object.keys(parsed).filter((k) => k !== "title" && k !== "steps");
    print("[RSG-JSON] unexpected top-level keys: " + (extras.length ? extras.join(",") : "<none>"));
  }

  // ------------------------------------------------------------------- 4. TTS

  private testTts(): void {
    const t0 = this.nowMs();
    print("[RSG-TTS] request sent model=" + OPENAI_TTS_MODEL + " input=\"online\" voice=coral");

    OpenAI.speech({ model: OPENAI_TTS_MODEL, input: "online", voice: "coral" })
      .then((track: AudioTrackAsset) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-TTS] OK latency=" + ms + "ms");
        if (this.audio) {
          this.audio.audioTrack = track;
          this.audio.play(1);
          print("[RSG-TTS] playing");
        }
      })
      .catch((error) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-TTS] FAIL latency=" + ms + "ms error=" + error);
      });
  }
}
