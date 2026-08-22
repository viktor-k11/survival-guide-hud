"use strict";
// The four cues the twelve-cue vocabulary was missing. Same phosphor family as
// gen_sfx_hud_cues.js: short attacks, dry, FM/triangle bodies, no reverb on the
// ticks (they fire often).
//
//   nav-tick   "advanced"  — rises. The mirror twin of nav-back.
//   nav-back   "reversed"  — falls. Same voice, an octave down at the tail.
//   panel-open  a surface appeared — two notes, low then high.
//   panel-close a surface went away — the SAME two notes, high then low.
//
// Both pairs are built as MIRRORS, not as two unrelated sounds: the point of a
// vocabulary is that "back" is audibly the opposite of "next", not merely
// different from it. Each pair therefore shares one voice function and differs
// only in the frequency arguments.
//
// `uiToggle` was tried first for the panel pair (its docs are literally
// "rising = on, falling = off") and dropped: the preset draws its interval from
// the RNG, so open and close came out as two unrelated toggles rather than one
// gesture played forwards and backwards. Hand-rolled, the two notes are the
// same two notes by construction.
const fs = require("fs");
const path = require("path");

const ENGINE = "/Users/kateryna/.claude/plugins/cache/ls-extensions/ls-clad/1.0.0/skills/build-sfx/tools";
const audio = require(ENGINE);

const PROJECT_ASSETS_SFX = "/Users/kateryna/survival-guide-hud/Specs Base Template/Assets/GeneratedSFX";
fs.mkdirSync(PROJECT_ASSETS_SFX, { recursive: true });

function ship(name, buf) {
  audio.mix_bus.masterChain(buf, { normalize: "peak" });
  audio.WavBuilder.write(buf, path.join(PROJECT_ASSETS_SFX, name + ".wav"));
  const mono = buf.left ? buf.left.length : buf.length;
  console.log("wrote " + name + ".wav  " + (mono / audio.SAMPLE_RATE).toFixed(3) + "s" + (buf.left ? " stereo" : " mono"));
}

// --- the movement pair -------------------------------------------------
//
// 45 ms, tonal, dry. Tonal on purpose: geiger-click is the only other cue
// this short and it is pure noise crackle, so a pitched tick can never be
// mistaken for a survey sample.
//
// The envelope holds near full level for the whole sweep and releases in 8 ms.
// An earlier version used a fast decay to a low sustain, which buried the
// second half of the sweep under the noise floor and left "back" measuring
// FLAT rather than falling — the contour has to survive the envelope.
function movementTick(f0, f1) {
  const body = audio.sweep(f0, f1, 0.036, "triangle", "exponential");
  audio.adsrExp(body, 0.0008, 0.004, 0.8, 0.008, 2);
  // A glassy attack transient at the START pitch, gone in ~8 ms, so it colours
  // the onset without sitting on the sweep and flattening it.
  const edge = audio.osc_models.fmOperator(f0 * 1.5, 0.01, 2, 2.5, (t) => Math.exp(-90 * t));
  const out = new Float32Array(Math.floor(0.045 * audio.SAMPLE_RATE));
  audio.addInto(out, body, 0, 1.0);
  audio.addInto(out, edge, 0, 0.22);
  audio.fadeOut(out, 0.005);
  return audio.mix_bus.applyFx(out, { hpf: 300, lpf: 11000, gain: 0.85 });
}

// Rising 1450 -> 1950. The contour IS the meaning.
function navTick() { return movementTick(1450, 1950); }
// Falling 1250 -> 620 — a wider interval than the tick's, and low enough that
// "back" sits below "next" in absolute pitch as well as in direction. Two ways
// to tell them apart, so neither has to carry it alone.
function navBack() { return movementTick(1250, 620); }

// --- the surface pair --------------------------------------------------
//
// Two FM blips a fifth apart, 55 ms between onsets. Softer attack and a small
// room, so a surface appearing reads as bigger and slower than a tick without
// being any louder — the volume tiers do the loudness, the timbre does the
// meaning.
function surfaceTwoTone(fA, fB) {
  const total = Math.floor(0.16 * audio.SAMPLE_RATE);
  const out = new Float32Array(total);
  const notes = [fA, fB];
  for (let i = 0; i < notes.length; i++) {
    const n = audio.osc_models.fmOperator(notes[i], 0.1, 2, 1.6, (t) => Math.exp(-14 * t));
    audio.adsrExp(n, 0.004, 0.03, 0.35, 0.06, 3);
    audio.addInto(out, n, Math.floor(i * 0.055 * audio.SAMPLE_RATE), i === 0 ? 0.85 : 0.75);
  }
  audio.fadeOut(out, 0.008);
  const wet = audio.mix_bus.applyFx(out, { hpf: 220, reverb: "smallRoom", gain: 0.8 });
  // smallRoom hands back a 0.76 s buffer that is mostly inaudible tail. A cue
  // that occupies three quarters of a second collides with whatever the user
  // does next, so the tail is cut to 0.3 s and faded — the room is still heard
  // on the two notes, which is the whole point of adding it.
  return trim(wet, 0.3, 0.05);
}

/** Cut a (possibly stereo) buffer to `seconds` with a fade so nothing clicks. */
function trim(buf, seconds, fadeSec) {
  const n = Math.floor(seconds * audio.SAMPLE_RATE);
  const cut = (ch) => { const o = ch.slice(0, n); audio.fadeOut(o, fadeSec); return o; };
  if (buf.left) return { left: cut(buf.left), right: cut(buf.right) };
  return cut(buf);
}

function panelOpen() { return surfaceTwoTone(700, 1050); }
function panelClose() { return surfaceTwoTone(1050, 700); }

ship("nav-tick", navTick());
ship("nav-back", navBack());
ship("panel-open", panelOpen());
ship("panel-close", panelClose());
console.log("four cues done — vocabulary now twelve");
