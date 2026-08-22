/**
 * Main-menu presenter — the two-column terminal screen shown in IDLE.
 *
 * IDLE *is* the menu: there is no menu mode. This presenter shows the menu
 * whenever the engine is IDLE (and no request is compiling) and hides it for
 * every other mode. ModeRouter still owns HUDRoot itself; this owns only what
 * is INSIDE HUDRoot/MainMenu (hard rule 3).
 *
 * Hard rule 1: every object this drives — six rows, the moving highlight, the
 * three detail panels, the frame — exists in the scene, disabled. This script
 * enables, populates and positions; it creates nothing. Children are found by
 * name, so the contract is the object names in Docs/SCENE-MAP.md.
 *
 * ## The highlight, and why it is a marker rather than a fill
 *
 * The reference look is a solid green bar with black text. On an additive
 * waveguide black renders as TRANSPARENT, so that treatment would erase the
 * row's own text. The emphasis here is a bright amber EDGE BAR plus corner
 * ticks around the highlighted row (and the row's label goes amber — the
 * project-wide "active" colour, same as the checklist cursor). Nothing is
 * dimmed to make it work: the menu's job is teaching what the app can do, so
 * every row stays readable.
 *
 * There is always exactly ONE highlighted row (default row 1), so the
 * description panel is never empty. Gaze/hover moves the highlight; pinch or
 * voice ACTIVATES (emits menuSelected — relaying a selection is not logic).
 *
 * ## The ask widget
 *
 * The menu lists SUGGESTIONS, not limits — the ask widget is what says so. Its
 * example line cycles prompts that are deliberately OUTSIDE the six rows, and
 * while the user holds the pinch the live interim transcript types into the
 * prompt line (the same voiceInterim stream the StatusBar renders).
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { eventBus, Events } from "../Engine/EventBus";
import { TrailStatePayload } from "../Engine/NavTypes";
import { CampChangedPayload, MenuSelectedPayload, RequestStatePayload } from "../Engine/RequestTypes";
import { XYZ } from "../Engine/SurveyTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import {
  adoptMaterial,
  isolateMaterial,
  pulse01,
  setColor,
  setEnabled,
  setFont,
  setIcon,
  setText,
  setTextColor,
  wrapText,
} from "./WidgetUtils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ROW_COUNT = 6;
const NAVIGATE_ROW = 6;

interface MenuRow {
  root: SceneObject;
  label: Text;
  value: Text;
  dot: SceneObject;
  dotMat: Material;
}

@component
export class MainMenuPresenter extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Objects this presenter drives</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Children of HUDRoot/MainMenu are found by name (Row_1..6, Highlight, DetailPane/…) — the contract is Docs/SCENE-MAP.md, not two dozen inspector fields.</span>')

  @input private theme: VisualConfig;
  @input @hint("HUDRoot/MainMenu") private mainMenu: SceneObject;

  @input
  @allowUndefined
  @hint("Camera Object — row 6 shows the live distance from here to the camp point.")
  private cameraObject: SceneObject;

  @input
  @allowUndefined
  @hint("PH_Plane.mesh — the ask widget's mic glyph re-meshes to a quad so the icon reads.")
  private quadMesh: RenderMesh;

  @input
  @allowUndefined
  @hint("PH_Icon.mat — the only material that can show an icon texture (ENABLE_BASE_TEX baked on).")
  private iconMaterial: Material;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Row copy</span>')

  @input
  @hint("Row labels, top to bottom. Row 6 shows only once a camp point is set.")
  @widget(new TextAreaWidget())
  private rowLabels: string[] = [
    "SCAN THIS AREA",
    "I NEED SHELTER",
    "I NEED FIRE",
    "I NEED WATER",
    "I'M HURT",
    "BACK TO CAMP",
  ];

  @input
  @hint("Description panel copy per row, 2-3 short lines once wrapped. This panel is the menu's real job: it teaches what the app can do.")
  @widget(new TextAreaWidget())
  private rowDescriptions: string[] = [
    "Sweeps the ground ahead and rates flat, safe spots for a tent and a fire.",
    "A step-by-step tent pitch with staged blueprint holograms on your chosen site.",
    "Build a campfire: cleared ground, tinder, log-cabin stack, then a safe light.",
    "Purify found water, with boil timers and a gear checklist along the way.",
    "First aid for a burn, step by step. In a real emergency, say SOS.",
    "Points you home: the row reads the live distance back to your marked camp.",
  ];

  @input @hint("Row 1 value before a survey has finished.") private scanReadyValue: string = "READY";
  @input @hint("Row 1 value after surveyComplete.") private scanDoneValue: string = "DONE";
  @input @hint("Characters per line for the description panel.") private descriptionWrapChars: number = 26;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Status block</span>')

  @input @hint("Third status line while no trail is recording.") private trailLine: string = "TRAIL OFF";

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Footer chips</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Children of MainMenu/FooterChips, found by name. FOLLOW TRAIL shows only once a trail exists; the chips are the pinch twins of the voice commands.</span>')

  @input @hint("Chip_SetCamp label.") private chipSetCampLabel: string = "[ SET CAMP ]";
  @input @hint("Chip_Trail label.") private chipTrailLabel: string = "[ LEAVING CAMP ]";
  @input @hint("Chip_Trail label while recording.") private chipTrailRecLabel: string = "[ ● REC ]";
  @input @hint("Chip_FollowTrail label.") private chipFollowLabel: string = "[ FOLLOW TRAIL ]";
  @input @hint("Chip_Log label — opens the session journal.") private chipLogLabel: string = "[ LOG ]";
  @input @hint("Chip_SOS label — enters SOS. Warning-coloured: it is the one chip that means an emergency.") private chipSosLabel: string = "[ SOS ]";

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Ask widget</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">These examples MUST stay outside the six menu rows — they are the proof the menu is a suggestion list, not a limit.</span>')

  @input private askTitle: string = "ASK ME ANYTHING";

  @input
  @widget(new TextAreaWidget())
  private askExamples: string[] = [
    'try: "how do I splint a broken wrist"',
    'try: "which way is north, no compass"',
    'try: "how do I dry wet boots overnight"',
    'try: "help me build a snare"',
    'try: "what firewood burns longest"',
  ];

  @input
  @widget(new SliderWidget(1.0, 8.0, 0.5))
  @hint("Seconds each example stays up. Same slow, legible cycle as the StatusBar ticker.")
  private askExampleIntervalSec: number = 3.0;

  @input
  @widget(new SliderWidget(0.5, 6.0, 0.5))
  @hint("Caret blink rate on the prompt line, Hz.")
  private caretHz: number = 2.5;

  @input
  @widget(new SliderWidget(10, 60, 1))
  @hint("The prompt line keeps the TAIL of a long interim transcript — the newest words are the ones being typed.")
  private promptMaxChars: number = 30;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Debug — preview iteration</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">No gaze/pinch in the Preview panel. These call the SAME methods hover and pinch call.</span>')

  @input private enableDebugKeys: boolean = true;
  @input @hint("Cycle the highlight down the visible rows.") private keyCycleHighlight: string = "J";
  @input @hint("Activate the highlighted row.") private keyActivate: string = "L";
  @input private enableLogging: boolean = true;

  // ------------------------------------------------------------------ state

  private rows: MenuRow[] = [];
  private highlight: SceneObject | null = null;
  private highlightMats: Material[] = [];
  private statusBody: Text | null = null;
  private descriptionBody: Text | null = null;
  private askMicGlyph: SceneObject | null = null;
  private askMicMat: Material | null = null;
  private askTitleText: Text | null = null;
  private askPromptLine: Text | null = null;
  private askExampleLine: Text | null = null;

  private mode: string = "IDLE";
  private requestState: string = "IDLE";
  /** The boot intro holds the screen; the menu waits for its done edge. */
  private introActive: boolean = false;
  private chipSetCamp: Text | null = null;
  private chipTrail: Text | null = null;
  private chipFollow: Text | null = null;
  private chipLog: Text | null = null;
  private chipSos: Text | null = null;
  private chipFollowRoot: SceneObject | null = null;
  /** The journal owns the screen while open — boot-intro pattern. */
  private journalOpen: boolean = false;
  private trail: TrailStatePayload | null = null;
  private voiceState: string = "idle";
  private interimText: string = "";
  private highlightIndex: number = 0;
  private surveyDone: boolean = false;
  private camp: XYZ | null = null;
  private exampleIndex: number = 0;
  private exampleElapsed: number = 0;
  private clock: number = 0;

  onAwake(): void {
    // SIK subscriptions must bind in OnStartEvent — the InteractionManager is
    // not up during awake and handlers bound there are silently dropped.
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[MENU] " + msg);
  }

  private onStart(): void {
    this.collect();

    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      this.mode = p ? p.to : "IDLE";
      this.applyVisibility();
    });
    eventBus.subscribe(Events.requestStateChanged, (p: RequestStatePayload) => {
      // COMPILING hands the screen to the StatusBar typewriter and the
      // assembling VFX; the menu returning is the "request finished" signal.
      this.requestState = p ? p.state : "IDLE";
      this.applyVisibility();
    });
    eventBus.subscribe(Events.voiceStateChanged, (p: { state: string }) => {
      this.voiceState = p ? p.state : "idle";
      if (this.voiceState !== "listening") this.interimText = "";
      this.renderStatus();
    });
    eventBus.subscribe(Events.voiceInterim, (p: { text: string }) => {
      this.interimText = p && p.text ? p.text : "";
    });
    eventBus.subscribe(Events.surveyComplete, () => {
      this.surveyDone = true;
      this.renderRows();
    });
    eventBus.subscribe(Events.introStateChanged, (p: { active: boolean }) => {
      this.introActive = !!(p && p.active);
      this.applyVisibility();
    });
    eventBus.subscribe(Events.journalStateChanged, (p: { open: boolean }) => {
      this.journalOpen = !!(p && p.open);
      this.applyVisibility();
    });
    eventBus.subscribe(Events.trailStateChanged, (p: TrailStatePayload) => {
      this.trail = p;
      this.renderStatus();
      this.renderChips();
    });
    eventBus.subscribe(Events.campChanged, (p: CampChangedPayload) => {
      const had = this.camp !== null;
      this.camp = p ? p.position : null;
      if (!had) this.log("camp set — row 6 available");
      this.applyVisibility();
    });
    // Voice selections land here too — moving the highlight to the chosen row
    // is the visible acknowledgement that the words hit a menu row.
    eventBus.subscribe(Events.menuSelected, (p: MenuSelectedPayload) => {
      if (p && p.row >= 1 && p.row <= ROW_COUNT) this.setHighlight(p.row - 1);
    });

    if (this.enableDebugKeys) this.bindDebugKeys();

    this.applyVisibility();
    this.log("ready. rows=" + this.rows.length + " debugKeys=" + this.keyCycleHighlight + "/" + this.keyActivate);
  }

  // ----------------------------------------------------------------- collect

  private collect(): void {
    if (!this.mainMenu) {
      this.log("mainMenu not wired — nothing to drive");
      return;
    }
    const font = this.theme ? this.theme.font : null;

    // Every Text under the menu gets the theme face once, up front.
    this.forEachText(this.mainMenu, (t) => setFont(t, font));

    this.rows = [];
    for (let i = 1; i <= ROW_COUNT; i++) {
      const root = findChildDeep(this.mainMenu, "Row_" + i);
      if (!root) {
        this.log("Row_" + i + " missing from the scene");
        continue;
      }
      const labelObj = findChildDeep(root, "Label");
      const valueObj = findChildDeep(root, "Value");
      const dot = findChildDeep(root, "ActiveDot");
      const dotVisual = dot ? (dot.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
      this.rows.push({
        root: root,
        label: labelObj ? (labelObj.getComponent("Component.Text") as Text) : null,
        value: valueObj ? (valueObj.getComponent("Component.Text") as Text) : null,
        dot: dot,
        dotMat: dotVisual ? isolateMaterial(dotVisual) : null,
      });

      const interactable = root.getComponent(Interactable.getTypeName()) as Interactable;
      if (interactable) {
        const index = i - 1;
        // Gaze/hover moves the highlight; pinch activates. Two different verbs.
        interactable.onHoverEnter.add(() => this.setHighlight(index));
        interactable.onTriggerEnd.add(() => this.activate(index, "pinch"));
      } else {
        this.log("Row_" + i + " has no SIK Interactable — pinch will not work, debug key still will");
      }
    }

    this.highlight = findChildDeep(this.mainMenu, "Highlight");
    this.highlightMats = [];
    if (this.highlight) {
      // Tint the whole marker (edge bar + ticks) amber, each via its own clone.
      collectVisualMats(this.highlight, this.highlightMats);
    }

    const statusBlock = findChildDeep(this.mainMenu, "StatusBlock");
    this.statusBody = bodyText(statusBlock);
    const descriptionBlock = findChildDeep(this.mainMenu, "DescriptionBlock");
    this.descriptionBody = bodyText(descriptionBlock);

    // Footer chips — pinch twins of the setCamp / leavingCamp / followTrail
    // voice commands. Relaying a pinch is not logic.
    const wireChip = (name: string, chip: "setCamp" | "trailStart" | "followTrail" | "journal" | "sos"): Text | null => {
      const obj = findChildDeep(this.mainMenu, name);
      if (!obj) {
        this.log(name + " missing from the scene");
        return null;
      }
      if (chip === "followTrail") this.chipFollowRoot = obj;
      const interactable = obj.getComponent(Interactable.getTypeName()) as Interactable;
      if (interactable) {
        interactable.onTriggerEnd.add(() => {
          if (!this.isVisible()) return;
          this.log("menuChipSelected " + chip + " via pinch");
          eventBus.emit(Events.menuChipSelected, { chip: chip, source: "pinch" });
        });
      }
      return obj.getComponent("Component.Text") as Text;
    };
    this.chipSetCamp = wireChip("Chip_SetCamp", "setCamp");
    this.chipTrail = wireChip("Chip_Trail", "trailStart");
    this.chipFollow = wireChip("Chip_FollowTrail", "followTrail");
    this.chipLog = wireChip("Chip_Log", "journal");
    this.chipSos = wireChip("Chip_SOS", "sos");

    const ask = findChildDeep(this.mainMenu, "AskWidget");
    if (ask) {
      this.askMicGlyph = findChildDeep(ask, "MicGlyph");
      if (this.askMicGlyph) {
        const v = this.askMicGlyph.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (v && this.quadMesh) v.mesh = this.quadMesh;
        this.askMicMat = this.iconMaterial ? adoptMaterial(v, this.iconMaterial) : isolateMaterial(v);
        setIcon(this.askMicMat, this.theme ? this.theme.icon("mic") : null);
      }
      const titleObj = findChildDeep(ask, "TitleText");
      this.askTitleText = titleObj ? (titleObj.getComponent("Component.Text") as Text) : null;
      const promptObj = findChildDeep(ask, "PromptLine");
      this.askPromptLine = promptObj ? (promptObj.getComponent("Component.Text") as Text) : null;
      const exampleObj = findChildDeep(ask, "ExampleLine");
      this.askExampleLine = exampleObj ? (exampleObj.getComponent("Component.Text") as Text) : null;
    }
  }

  private forEachText(obj: SceneObject, fn: (t: Text) => void): void {
    const t = obj.getComponent("Component.Text") as Text;
    if (t) fn(t);
    for (let i = 0; i < obj.getChildrenCount(); i++) this.forEachText(obj.getChild(i), fn);
  }

  // -------------------------------------------------------------- visibility

  private isVisible(): boolean {
    return this.mode === "IDLE" && this.requestState !== "COMPILING" && !this.introActive && !this.journalOpen;
  }

  /**
   * Everything under MainMenu ships disabled, leaf children included (hard
   * rule 1), so showing the menu means enabling the WHOLE chain and then
   * re-hiding the conditional bits: row 6 without a camp, dots without state.
   */
  private applyVisibility(): void {
    if (!this.mainMenu) return;
    const visible = this.isVisible();
    setEnabled(this.mainMenu, visible);
    if (!visible) return;

    enableSubtree(this.mainMenu);
    this.renderRows();
    this.setHighlight(this.highlightIndex);
    this.renderStatus();
    this.renderChips();
  }

  private renderChips(): void {
    if (!this.isVisible()) return;
    const theme = this.theme;
    const recording = !!(this.trail && this.trail.recording);
    setText(this.chipSetCamp, this.chipSetCampLabel);
    setText(this.chipTrail, recording ? this.chipTrailRecLabel : this.chipTrailLabel);
    setText(this.chipFollow, this.chipFollowLabel);
    setText(this.chipLog, this.chipLogLabel);
    setText(this.chipSos, this.chipSosLabel);
    // FOLLOW TRAIL exists only when there is a trail to follow.
    setEnabled(this.chipFollowRoot, !!(this.trail && this.trail.markCount > 0));
    if (theme) {
      setTextColor(this.chipSetCamp, theme.primaryPhosphor, theme.glowIntensity * 0.8);
      setTextColor(this.chipTrail, recording ? theme.accentAmber : theme.primaryPhosphor, theme.glowIntensity * (recording ? 1.0 : 0.8));
      setTextColor(this.chipFollow, theme.primaryPhosphor, theme.glowIntensity * 0.8);
      setTextColor(this.chipLog, theme.primaryPhosphor, theme.glowIntensity * 0.8);
      // The one warning-coloured chip: it means an emergency, nothing else does.
      setTextColor(this.chipSos, theme.warningColor, theme.glowIntensity);
    }
  }

  // ------------------------------------------------------------------- rows

  private renderRows(): void {
    if (!this.isVisible()) return;
    const theme = this.theme;

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const isNavRow = i === NAVIGATE_ROW - 1;
      const shown = !isNavRow || this.camp !== null;
      setEnabled(row.root, shown);
      if (!shown) continue;

      setText(row.label, this.rowLabels[i] || "");

      // The value column carries STATE, not numbers. Blank = nothing to say.
      let value = "";
      if (i === 0) value = this.surveyDone ? this.scanDoneValue : this.scanReadyValue;
      else if (isNavRow) value = this.campDistanceLabel();
      setText(row.value, value);

      // A small filled square marks rows that are "active/set": the survey
      // once it has run, the camp row once a camp exists.
      const dotOn = (i === 0 && this.surveyDone) || (isNavRow && this.camp !== null);
      setEnabled(row.dot, dotOn);

      if (theme) {
        const isHighlighted = i === this.highlightIndex;
        setTextColor(row.label, isHighlighted ? theme.accentAmber : theme.primaryPhosphor, theme.glowIntensity);
        setTextColor(row.value, theme.primaryPhosphor, theme.glowIntensity * 0.75);
        if (row.dotMat) setColor(row.dotMat, theme.primaryPhosphor, theme.glowIntensity);
      }
    }
  }

  /** Live distance to camp, metres, for row 6's value column. */
  private campDistanceLabel(): string {
    if (!this.camp || !this.cameraObject) return "";
    const cam = this.cameraObject.getTransform().getWorldPosition();
    const dx = cam.x - this.camp.x;
    const dy = cam.y - this.camp.y;
    const dz = cam.z - this.camp.z;
    const metres = Math.sqrt(dx * dx + dy * dy + dz * dz) / 100;
    return Math.max(1, Math.round(metres)) + " M";
  }

  /** Move the single highlight marker to a row and repaint the description. */
  private setHighlight(index: number): void {
    if (index < 0 || index >= this.rows.length) return;
    // Row 6 cannot hold the highlight while it is hidden.
    if (index === NAVIGATE_ROW - 1 && this.camp === null) index = 0;
    this.highlightIndex = index;

    const row = this.rows[index];
    if (this.highlight && row && row.root) {
      const t = this.highlight.getTransform();
      const rowPos = row.root.getTransform().getLocalPosition();
      const own = t.getLocalPosition();
      t.setLocalPosition(new vec3(own.x, rowPos.y, own.z));
    }
    if (this.theme && this.highlightMats.length > 0) {
      for (let i = 0; i < this.highlightMats.length; i++) {
        setColor(this.highlightMats[i], this.theme.accentAmber, this.theme.glowIntensity);
      }
    }
    if (this.descriptionBody) {
      setText(this.descriptionBody, wrapText(this.rowDescriptions[index] || "", this.descriptionWrapChars));
      if (this.theme) setTextColor(this.descriptionBody, this.theme.primaryPhosphor, this.theme.glowIntensity * 0.9);
    }
    this.renderRows();
  }

  /**
   * Activation — relaying the choice is not logic; deciding what it means is
   * the subscribers' job (SurveyController, LessonCoordinator, LessonEngine).
   */
  private activate(index: number, source: string): void {
    if (!this.isVisible()) return;
    const isNavRow = index === NAVIGATE_ROW - 1;
    if (isNavRow && this.camp === null) return;
    const payload: MenuSelectedPayload = {
      row: index + 1,
      source: source,
      position: isNavRow ? this.camp : null,
    };
    this.log("menuSelected row " + payload.row + " via " + source);
    eventBus.emit(Events.menuSelected, payload);
  }

  // ----------------------------------------------------------- detail panels

  private renderStatus(): void {
    if (!this.isVisible() || !this.statusBody) return;
    const mic =
      this.voiceState === "listening" ? "MIC LISTENING" :
      this.voiceState === "finalizing" ? "MIC THINKING" : "MIC READY";
    const camp = "CAMP " + (this.camp ? "SET" : "UNSET");
    // The terminal line the trail recorder owns: TRAIL ● REC · 12 MARKS · 47 M
    const t = this.trail;
    const trailLine = t && t.recording
      ? "TRAIL ● REC · " + t.markCount + " MARKS · " + t.pathM + " M"
      : t && t.markCount > 0
      ? "TRAIL SAVED · " + t.markCount + " MARKS"
      : this.trailLine;
    setText(this.statusBody, mic + "\n" + camp + "\n" + trailLine);
    if (this.theme) {
      const warm = this.voiceState !== "idle";
      setTextColor(this.statusBody, warm ? this.theme.accentAmber : this.theme.primaryPhosphor, this.theme.glowIntensity * 0.85);
    }
  }

  private renderAskWidget(dt: number): void {
    const theme = this.theme;

    if (this.askTitleText) {
      setText(this.askTitleText, this.askTitle);
      if (theme) setTextColor(this.askTitleText, theme.primaryPhosphor, theme.glowIntensity);
    }

    // Prompt line: the caret alone while idle; the LIVE interim transcript
    // typing in while the user holds the pinch. This is the single most
    // convincing thing on the screen, and the stream already existed.
    if (this.askPromptLine) {
      const caret = Math.floor(this.clock * this.caretHz * 2) % 2 === 0 ? "_" : " ";
      let body = this.voiceState === "listening" || this.voiceState === "finalizing" ? this.interimText : "";
      if (body.length > this.promptMaxChars) body = body.substring(body.length - this.promptMaxChars);
      setText(this.askPromptLine, "> " + body + caret);
      if (theme) {
        const live = body.length > 0 || this.voiceState !== "idle";
        setTextColor(this.askPromptLine, live ? theme.accentAmber : theme.primaryPhosphor, theme.glowIntensity);
      }
    }

    // Example ticker — same machinery as the StatusBar's: slow, legible cycle.
    if (this.askExampleLine) {
      this.exampleElapsed += dt;
      if (this.exampleElapsed >= this.askExampleIntervalSec) {
        this.exampleElapsed = 0;
        this.exampleIndex++;
      }
      const n = this.askExamples ? this.askExamples.length : 0;
      setText(this.askExampleLine, n > 0 ? this.askExamples[this.exampleIndex % n] : "");
      if (theme) setTextColor(this.askExampleLine, theme.accentAmber, theme.glowIntensity * 0.8);
    }

    // Mic glyph: breathing while idle, faster and amber while listening —
    // mirrors the StatusBar mic so the affordance reads as the same organ.
    if (this.askMicMat && theme) {
      const listening = this.voiceState === "listening";
      const hz = listening ? theme.pulseHz * 2.0 : theme.pulseHz;
      const level = (0.45 + 0.55 * pulse01(this.clock, hz)) * theme.glowIntensity;
      setColor(this.askMicMat, listening ? theme.accentAmber : theme.primaryPhosphor, level);
    }
  }

  // ----------------------------------------------------------------- update

  private onUpdate(): void {
    if (!this.isVisible()) return;
    const dt = getDeltaTime();
    this.clock = getTime();

    this.renderAskWidget(dt);

    // Row 6's distance is live — the whole point of the row.
    if (this.camp !== null) {
      const row = this.rows[NAVIGATE_ROW - 1];
      if (row) setText(row.value, this.campDistanceLabel());
    }
  }

  // ------------------------------------------------------------- debug keys

  private keyFromLetter(letter: string): Keys {
    const idx = LETTERS.indexOf((letter || "").toUpperCase().charAt(0));
    if (idx < 0) return Keys.Invalid;
    return (Keys.A + idx) as Keys;
  }

  private bindDebugKeys(): void {
    const cycle = this.keyFromLetter(this.keyCycleHighlight);
    const activate = this.keyFromLetter(this.keyActivate);
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      if (!this.isVisible()) return;
      if (e.key === cycle) {
        let next = (this.highlightIndex + 1) % this.rows.length;
        if (next === NAVIGATE_ROW - 1 && this.camp === null) next = 0;
        this.setHighlight(next);
      } else if (e.key === activate) {
        this.activate(this.highlightIndex, "debugKey");
      }
    });
  }
}

// ----------------------------------------------------------------- helpers

function findChildDeep(parent: SceneObject, name: string): SceneObject | null {
  if (!parent) return null;
  for (let i = 0; i < parent.getChildrenCount(); i++) {
    const c = parent.getChild(i);
    if (c.name === name) return c;
    const deep = findChildDeep(c, name);
    if (deep) return deep;
  }
  return null;
}

/** Enable an object and every descendant — hard rule 1's "whole chain" note. */
function enableSubtree(obj: SceneObject): void {
  obj.enabled = true;
  for (let i = 0; i < obj.getChildrenCount(); i++) enableSubtree(obj.getChild(i));
}

/** The Body text of a bordered block. */
function bodyText(block: SceneObject | null): Text | null {
  const obj = block ? findChildDeep(block, "Body") : null;
  return obj ? (obj.getComponent("Component.Text") as Text) : null;
}

/** Isolate every RenderMeshVisual material in a subtree, collecting the clones. */
function collectVisualMats(obj: SceneObject, out: Material[]): void {
  const v = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  if (v) {
    const m = isolateMaterial(v);
    if (m) out.push(m);
  }
  for (let i = 0; i < obj.getChildrenCount(); i++) collectVisualMats(obj.getChild(i), out);
}
