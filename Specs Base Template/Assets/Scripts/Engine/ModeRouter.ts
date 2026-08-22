/**
 * Owns which root trees are visible for the current mode. Nothing else may
 * enable or disable HUDRoot or WorldRoot.
 *
 * This exists because StatusBarPresenter used to enable HUDRoot itself — a
 * presenter deciding the HUD is visible. That is a routing decision, and with
 * more than one presenter it becomes a race about who turns what on. One owner,
 * driven by modeChanged.
 *
 * Engine-side by design: it makes a decision, so it cannot be a widget
 * (hard rule 3). It touches only the two root SceneObjects, never their
 * contents — each presenter owns what is inside.
 */
import { eventBus, Events } from "./EventBus";

@component
export class ModeRouter extends BaseScriptComponent {
  @input
  @hint("HUDRoot — the head-locked tree.")
  private hudRoot: SceneObject;

  @input
  @hint("WorldRoot — the world-anchored tree.")
  private worldRoot: SceneObject;

  @input
  @hint("Show WorldRoot during a lesson. Off until the survey/terrain features land, since its contents are still placeholders.")
  private worldVisibleInLesson: boolean = false;

  @input private enableLogging: boolean = true;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart(): void {
    eventBus.subscribe(Events.modeChanged, (p: { from: string; to: string }) => {
      this.applyMode(p ? p.to : "IDLE");
    });
    // The engine emits modeChanged only on a CHANGE, and it boots in IDLE
    // without emitting. Apply the initial state explicitly or the HUD never
    // appears until the first transition.
    this.applyMode("IDLE");
  }

  private applyMode(mode: string): void {
    let hud = true;
    let world = false;

    if (mode === "IDLE") {
      hud = true;
      // WorldRoot stays up in IDLE so the site markers survive the survey and
      // remain standing on the terrain while the user decides what to ask for.
      // Its contents are individually disabled, so this shows only what a
      // presenter has actually placed.
      world = true;
    } else if (mode === "LESSON") {
      hud = true;
      world = this.worldVisibleInLesson;
    } else if (mode === "SURVEY") {
      hud = true;
      world = true;
    } else if (mode === "NAVIGATE") {
      // The compass rose, the trail stakes and the camp stake all live under
      // WorldRoot; the HUD carries the bearing/distance line.
      hud = true;
      world = true;
    } else if (mode === "SOS") {
      hud = true;
      // The compass rose — pointed at the most open sampled direction by the
      // survey's SOS handler — lives under WorldRoot.
      world = true;
    } else if (mode === "COMPLETE") {
      hud = true;
      // WorldRoot stays UP through COMPLETE (changed 2026-08-21): the last
      // hologram stage — the finished tent, the lit fire — is the payoff frame
      // the completion card sits over. Blanking the world at the exact moment
      // the lesson succeeds threw away the one picture worth keeping. Contents
      // are individually disabled, so this shows only what a presenter placed.
      world = true;
    }

    if (this.hudRoot) this.hudRoot.enabled = hud;
    if (this.worldRoot) this.worldRoot.enabled = world;

    if (this.enableLogging) {
      print("[MODE] " + mode + " -> HUDRoot=" + hud + " WorldRoot=" + world);
    }
  }
}
