# RSG Token Refresh — demo-day runbook

**Read this first, not the code.** Everything below is a 60-second fix.

---

## 1. Where the token lives

| | |
|---|---|
| **File** | `Assets/Scripts/Engine/RsgTokenLocal.ts` |
| **In git?** | **No — git-ignored on purpose.** This repo is public. |
| **Template** | `Assets/Scripts/Engine/RsgTokenLocal.example.ts` (committed) |
| **Who reads it** | `RsgTokens.ts` → `installRsgTokens()`, called once at boot |

The token is **never** put in the `RemoteServiceGatewayCredentials` Inspector
fields. Those `@input` strings serialize into `Assets/Scene.scene`, which is
committed as plaintext. Do not paste a token there — not even "just to test".

If a teammate clones the repo and the project won't compile with
`Cannot find module './RsgTokenLocal'`, that is expected: copy
`RsgTokenLocal.example.ts` → `RsgTokenLocal.ts` and paste a token in.

---

## 2. Is it actually the token? (30 seconds)

Most "AI is broken" moments on this project are **not** the token. Check the
error text before touching anything:

| Error text you see | Cause | Fix |
|---|---|---|
| `Publisher model ... was not found or your project does not have access to it` + `"code": 404` | **Model name**, not auth | Edit `GEMINI_MODEL` in `Assets/Scripts/Engine/RsgModels.ts`. See §4. |
| `"code": 401` / `403`, `Unauthenticated`, `UNAUTHENTICATED` | Token expired or revoked | §3 |
| `Proxy error: Parameter value for model cannot be empty` | Empty model string reached the gateway | Something overwrote `GEMINI_MODEL` |
| Nothing at all, call never returns | No internet / gateway down | Check connectivity; not a token issue |
| `Pipe was already closed` right after opening a realtime socket | Token **or** model id — almost never network | §3, then §4 |

A **404 is never a token problem.** The token is fine if any other RSG call
(e.g. TTS) still works.

---

## 3. Regenerating the token

**Fastest path — Lens Studio UI:**

> **Window → Remote Service Gateway Token → Generate**

Then copy the value into `Assets/Scripts/Engine/RsgTokenLocal.ts`. You need to
be signed in to Lens Studio with the Snap account that owns the project. That
is the whole procedure.

**What we measured about token lifetime (2026-08-20):**

The `POST https://gcp.api.snapchat.com/smart-gate/v2/token/{SNAP|OPENAI|GOOGLE}`
endpoint behind that button:

- returns `{"token": "<uuid>", "timestamp": "..."}` — **no `expires_in`, no
  `exp`, no TTL field of any kind**;
- returns an opaque **36-char UUID, not a JWT**, so there is no expiry claim to
  decode locally;
- is **idempotent**: two back-to-back calls returned byte-identical tokens, and
  they matched the token generated ~15 minutes earlier in the same session;
- reported `timestamp: 2026-08-15T11:56:44Z` — **five days before the call**,
  i.e. it re-serves a stored credential rather than minting a fresh one.

**Practical consequences:**

1. **The observed lifetime is ≥ 5 days, not ~1 hour.** An earlier note in
   `CLAD-PROMPT-LOG.md` claimed ~1h TTL; that was repeated from the RSG skill
   docs and is **not** what this account's gateway does. Corrected here.
2. **Re-running the generator will NOT fix an expired token by itself**, because
   the endpoint hands back the same stored value. If you get a genuine 401,
   sign out and back in to Lens Studio (or use a different Snap account) to
   force the server to mint a new one — simply clicking Generate again is a
   no-op.
3. Because the credential is **long-lived and account-scoped**, leaking it is
   worse than leaking an hourly token. This is why it is git-ignored, and why
   the leak check in §1 matters.

Not verified: whether the credential ever expires server-side. Five days of
observed validity is a lower bound, not a guarantee. Treat a 401 on demo day as
possible, and follow point 2.

---

## 4. Changing the Gemini model

One constant, one file:

```
Assets/Scripts/Engine/RsgModels.ts  →  export const GEMINI_MODEL = "gemini-2.5-flash";
```

No model names anywhere else. If it 404s, set `RUN_PROBE = true` in
`Assets/Scripts/Engine/RsgSmokeTest.ts` and run the preview: it sweeps a
candidate list and logs `[RSG-PROBE] <model> HTTP <code>` for each, stopping at
the first success.

Known status on this account, measured 2026-08-20:

| Model | Result |
|---|---|
| `gemini-2.5-flash` | **200 — in use** |
| `gemini-2.0-flash` | 404, publisher model not available |

The gateway exposes **no `models.list`**: the RSG wrapper hardcodes the
`models` endpoint and forwards `type` as the verb, and a `type: "list"` call is
rejected with `Parameter value for model cannot be empty`. Candidate sweeping is
the only enumeration available.

---

## 5. Sanity check that everything is alive

Open the preview with `RSG Smoke Test [TEMP]` enabled and watch the Logger for:

```
[RSG-SMOKE] tokens installed google=… openAI=… snap=…
[RSG-JSON]  OK latency=…ms
[RSG-JSON]  schema match: title=true steps=true …
```

`tokens installed … <unset>` means `RsgTokenLocal.ts` still holds the
placeholder text — go to §3.
