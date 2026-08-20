/**
 * TEMPLATE — copy this file to `RsgTokenLocal.ts` (same folder) and paste your
 * own Remote Service Gateway tokens into it.
 *
 *     cp RsgTokenLocal.example.ts RsgTokenLocal.ts
 *
 * `RsgTokenLocal.ts` is git-ignored and MUST stay that way: this repo is public.
 * Never paste a token into the RemoteServiceGatewayCredentials Inspector fields —
 * those @input strings are serialized verbatim into Assets/Scene.scene, which IS
 * committed. Tokens are short-lived (~1h); regenerate via
 * Window > Remote Service Gateway Token when calls start returning auth errors.
 */
export const RSG_TOKENS = {
  snap: "[INSERT SNAP TOKEN HERE]",
  openAI: "[INSERT OPENAI TOKEN HERE]",
  google: "[INSERT GOOGLE TOKEN HERE]",
};
