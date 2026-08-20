/**
 * Installs the local RSG tokens into RemoteServiceGatewayCredentials' static
 * store, which is where Gemini/OpenAI/Imagen actually read them from at call
 * time (see RemoteServiceGatewayCredentials.getApiToken).
 *
 * Doing it this way means no RemoteServiceGatewayCredentials component — and
 * therefore no token string — is ever serialized into Assets/Scene.scene.
 * The scene file is committed to a public repo; the token file is git-ignored.
 *
 * Call installRsgTokens() once, from OnStartEvent, before any RSG call.
 */
import { RemoteServiceGatewayCredentials } from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials";
import { RSG_TOKENS } from "./RsgTokenLocal";

// The statics are declared `private` for Inspector hygiene, not for isolation:
// the component itself assigns them from its @input fields in onAwake. We take
// the same route without putting the values in the scene.
const credentials = RemoteServiceGatewayCredentials as any;

export function installRsgTokens(): void {
  credentials.snapToken = RSG_TOKENS.snap;
  credentials.openAIToken = RSG_TOKENS.openAI;
  credentials.googleToken = RSG_TOKENS.google;
}

/** Masked form for logs — never print a whole token. */
export function tokenFingerprint(token: string): string {
  if (!token || token.indexOf("[INSERT") === 0) return "<unset>";
  return token.substring(0, 6) + "..." + token.length + "ch";
}
