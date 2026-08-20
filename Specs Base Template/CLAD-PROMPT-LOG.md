# CLAD Prompt Log — Survival Guide HUD

**Project:** Survival Guide HUD — a hands-free AR survival guide for Snap
Spectacles (SPECS), built for CLAD Hackathon Week 2, theme "Guide". On boot
the Lens surveys the terrain and marks suggested sites (tent / fire) with
rated icons. The microphone is the primary input: the user pinch-holds and
asks for help with an outdoor task; Gemini (via Remote Service Gateway)
returns a structured JSON lesson rendered as spatial widgets — a right-side
phosphor guide panel, staged blueprint holograms, ground zones, timers,
checklists — narrated by TTS. During a lesson, free-form voice questions are
answered aloud by Gemini with step context. Retro-futuristic phosphor HUD
aesthetic. See `CLAUDE.md` for the full HARD RULES governing all work in this
repo.

## Log format

This log is a chronological, append-only record of every prompt given to an
AI agent working on this project. History is never rewritten or edited after
the fact — corrections are new entries, not amendments to old ones.

Each entry has:

- **Sequence number** — `#N`, incrementing.
- **Timestamp** — date the prompt was given.
- **Prompt** — the user's prompt, verbatim, inside a fenced code block.
- **Summary** — one line describing what was actually done in response.
- **Notes** — decisions made, trade-offs, or issues discovered along the way.
  Omit or leave brief if there's nothing notable.

---

## #1 — 2026-08-20

**Prompt:**

```
Read CLAUDE.md at the project root and treat its seven HARD RULES as permanent
project rules for every task in this repo from now on. Note that CLAUDE.md also
imports AGENTS.md — both apply.

Then do the bootstrap:

1. Create CLAD-PROMPT-LOG.md at the project root with:
   - a header describing the project (Survival Guide HUD — hands-free AR survival
     guide for Snap Spectacles, CLAD Hackathon Week 2, theme "Guide"),
   - a short description of the log format: chronological entries, each with a
     sequence number, timestamp, the user prompt VERBATIM inside a fenced block,
     a one-line summary of what was done, and a "Notes" line for decisions or
     discovered issues. History is append-only and never rewritten.
   - entry #1 = this prompt, per rule 4.

2. The git repository root is the PARENT directory of this Lens Studio project
   (the folder containing "Specs Base Template"). Create a .gitignore there with:
   .DS_Store, *.tmp, node_modules/, .cache/, Temp/, *.esproj.user
   Do not touch the Lens Studio-managed .gitignore inside the project folder.

3. Verify what git will actually track before committing: run `git status
   --porcelain` and `git check-ignore -v` on a few paths, and confirm that
   Cache/, Support/, Workspaces/, PluginsUserPreferences/, *.lock and
   spk_debug_key.pem are all excluded. Report the file count that would be
   committed. If anything obviously generated is still tracked, tell me before
   committing rather than fixing it silently.

4. Commit everything as the initial commit with message:
   chore: project rules and prompt log bootstrap
   Then push to origin main. Do NOT create any other branches yet.

Answer in Russian when talking to me; all files, commits and code comments in
English.
```

**Summary:** Bootstrapped the repo — read `CLAUDE.md`/`AGENTS.md`, created this
log, added a repo-root `.gitignore`, verified generated Lens Studio artifacts
are excluded, and made the initial commit.

**Notes:** Repo root (parent of `Specs Base Template/`) was already an
initialized git repository with `origin` pointing at
`git@github.com:viktor-k11/survival-guide-hud.git`, on branch `main` with no
commits yet. The Lens Studio project already ships its own `.gitignore`
excluding `Cache/`, `PluginsUserPreferences/`, `Support/`, `Workspaces/`,
`.vscode/`, `.DS_Store`, `spk_debug_key.pem`, and `*.lock` — left untouched
per instructions.
