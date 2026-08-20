/**
 * Installs the RSG tokens once at boot. PERMANENT — not diagnostic code.
 *
 * This exists because the token install used to live inside RsgSmokeTest.ts.
 * Disabling that throwaway diagnostic silently broke every Gemini call with
 * "Proxy error: Parameter value for api-token cannot be empty" — the plumbing
 * was permanent but its only call site was not. Deleting the smoke test would
 * have done the same thing on a worse day.
 *
 * Runs in onAwake so the tokens are in place before any OnStart handler makes
 * a request. Keep this component enabled and above anything that calls RSG.
 */
import { RSG_TOKENS } from "./RsgTokenLocal";
import { installRsgTokens, tokenFingerprint } from "./RsgTokens";

@component
export class RsgBootstrap extends BaseScriptComponent {
  @input
  @hint("Print the masked token fingerprints at boot. Never prints a whole token.")
  private enableLogging: boolean = true;

  onAwake(): void {
    installRsgTokens();
    if (this.enableLogging) {
      print(
        "[RSG] tokens installed" +
          " google=" + tokenFingerprint(RSG_TOKENS.google) +
          " openAI=" + tokenFingerprint(RSG_TOKENS.openAI) +
          " snap=" + tokenFingerprint(RSG_TOKENS.snap)
      );
    }
  }
}
