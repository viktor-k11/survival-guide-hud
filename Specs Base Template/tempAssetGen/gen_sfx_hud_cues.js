"use strict";
// Six phosphor-HUD cues, short attacks. Presets first (uiBlip / uiError /
// powerUp / uiSuccess); geiger click and survey ping are hand-rolled — no
// preset covers a radiation tick or a single sonar ping.
const fs = require("fs");
const path = require("path");

const ENGINE = "/Users/kateryna/.claude/plugins/cache/ls-extensions/ls-clad/1.0.0/skills/build-sfx/tools";
const audio = require(ENGINE);
const p = audio.sfx_presets;

const PROJECT_ASSETS_SFX = "/Users/kateryna/survival-guide-hud/Specs Base Template/Assets/GeneratedSFX";
fs.mkdirSync(PROJECT_ASSETS_SFX, { recursive: true });

function ship(name, buf) {
  audio.mix_bus.masterChain(buf, { normalize: "peak" });
  audio.WavBuilder.write(buf, path.join(PROJECT_ASSETS_SFX, name + ".wav"));
  const mono = buf.left ? buf.left.length : buf.length;
  console.log("wrote " + name + ".wav  " + (mono / audio.SAMPLE_RATE).toFixed(3) + "s" + (buf.left ? " stereo" : " mono"));
}

// 1. geiger-click — survey sampling tick. A 4 ms crackle: HPF'd noise snap
// with a hint of low thock so it does not vanish on small speakers. Fires
// many times per survey, so it must be tiny and dry (no reverb tail).
function geigerClick() {
  const snap = audio.whiteNoise(0.012);
  audio.adsrExp(snap, 0.0005, 0.003, 0, 0.008, 5);
  const snapF = audio.mix_bus.applyFx(snap, { hpf: 2600, lpf: 9000, gain: 0.9 });
  const tick = audio.sweep(900, 500, 0.01, "triangle", "exponential");
  audio.adsrExp(tick, 0.0005, 0.004, 0, 0.005, 5);
  const out = new Float32Array(Math.floor(0.03 * audio.SAMPLE_RATE));
  audio.addInto(out, snapF, 0, 1.0);
  audio.addInto(out, tick, 0, 0.35);
  audio.fadeOut(out, 0.004);
  return out;
}

// 2. confirm-blip — the FM confirmation preset, pitched up slightly so it
// sits above the narration band.
function confirmBlip() { return p.uiBlip({ pitch: 2 }); }

// 3. error-buzz — the two-tone descending buzz preset, firm but controlled.
function errorBuzz() { return p.uiError({}); }

// 4. crt-power-on — boot cue. The clean ascending powerUp preset layered
// with a soft high sparkle so it reads as a screen waking, not a game jingle.
function crtPowerOn() {
  const up = p.powerUp({ retro: false });
  const shimmer = p.sparkle({ duration: 0.7 });
  const upS = audio.audio_primitives.stereoFromMono(up.left ? up.left : up);
  const n = Math.max(upS.left.length, shimmer.left.length);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < upS.left.length; i++) { L[i] += upS.left[i]; R[i] += (upS.right ? upS.right[i] : upS.left[i]); }
  for (let i = 0; i < shimmer.left.length; i++) { L[i] += shimmer.left[i] * 0.35; R[i] += shimmer.right[i] * 0.35; }
  const out = { left: L, right: R };
  audio.fadeOut(out.left, 0.02); audio.fadeOut(out.right, 0.02);
  return out;
}

// 5. survey-ping — one per placed marker. A single sonar ping: FM bell tone
// with a slow natural decay and a small-room tail. Deliberately one note —
// three markers land close together and two-note pings would melody-clash.
function surveyPing() {
  const body = audio.osc_models.fmOperator(1180, 0.55, 2, 1.5, (t) => Math.exp(-6 * t));
  audio.adsrExp(body, 0.002, 0.08, 0.35, 0.4, 3);
  return audio.mix_bus.applyFx(body, { hpf: 300, reverb: "smallRoom", gain: 0.8 });
}

// 6. completion-sting — the ascending mallet/bell arpeggio preset.
function completionSting() { return p.uiSuccess(); }

ship("geiger-click", geigerClick());
ship("confirm-blip", confirmBlip());
ship("error-buzz", errorBuzz());
ship("crt-power-on", crtPowerOn());
ship("survey-ping", surveyPing());
ship("completion-sting", completionSting());
console.log("all six cues done");
