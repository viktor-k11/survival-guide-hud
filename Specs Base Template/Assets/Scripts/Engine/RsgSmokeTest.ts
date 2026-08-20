/**
 * THROWAWAY DIAGNOSTIC — delete this file and its SceneObject once RSG is
 * confirmed working. Not architecture: it deliberately ignores the
 * Engine/Widgets split and does its own logging.
 *
 * Runs two RSG calls on boot and reports raw response + latency:
 *   [RSG-GEMINI]  gemini-2.0-flash chat completion, prompt "reply: alive"
 *   [RSG-TTS]     gpt-4o-mini-tts synthesis of "online", played in preview
 *
 * Keep RsgTokens.ts when you delete this — it is the permanent token plumbing.
 */
import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
import { GeminiTypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";
import { OpenAI } from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI";
import { RSG_TOKENS } from "./RsgTokenLocal";
import { installRsgTokens, tokenFingerprint } from "./RsgTokens";

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

    // AudioComponent is authored in the scene (design-time), not created here.
    this.audio = this.sceneObject.getComponent("Component.AudioComponent");
    if (!this.audio) {
      print("[RSG-TTS] FAIL: no AudioComponent on " + this.sceneObject.name);
    }

    this.testGemini();
    this.testTts();
  }

  private testGemini(): void {
    const request: GeminiTypes.Models.GenerateContentRequest = {
      model: "gemini-2.0-flash",
      type: "generateContent",
      body: {
        contents: [{ parts: [{ text: "reply: alive" }], role: "user" }],
      },
    };

    const t0 = this.nowMs();
    print("[RSG-GEMINI] request sent model=gemini-2.0-flash prompt=\"reply: alive\"");

    Gemini.models(request)
      .then((response) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-GEMINI] OK latency=" + ms + "ms");
        print("[RSG-GEMINI] raw=" + JSON.stringify(response));
      })
      .catch((error) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-GEMINI] FAIL latency=" + ms + "ms error=" + error);
      });
  }

  private testTts(): void {
    const t0 = this.nowMs();
    print("[RSG-TTS] request sent model=gpt-4o-mini-tts input=\"online\" voice=coral");

    OpenAI.speech({
      model: "gpt-4o-mini-tts",
      input: "online",
      voice: "coral",
    })
      .then((track: AudioTrackAsset) => {
        const ms = Math.round(this.nowMs() - t0);
        print("[RSG-TTS] OK latency=" + ms + "ms track=" + (track ? track.name : "null"));
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
