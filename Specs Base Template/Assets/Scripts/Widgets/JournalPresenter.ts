/**
 * Journal presenter — the session log terminal screen.
 *
 * A VIEW OVER THE BUS, deliberately: it keeps no engine state and adds none.
 * Events that already exist (surveyComplete, hazardsDetected, lessonCompleted,
 * campChanged, trailStateChanged edges, distanceWarning) are formatted into at
 * most eight lines; when the ninth arrives the oldest drops. Nothing else in
 * the system knows the journal exists.
 *
 * Opened by the LOG footer chip or voice ("show the log" / "log"), both of
 * which arrive as menuChipSelected {chip:"journal"} — the same two-emitter
 * pattern every chip uses. The menu yields the screen while the journal is
 * open (journalStateChanged, same pattern as the boot intro) and takes it
 * back on close. Any mode change away from IDLE closes it.
 *
 * ## Timestamps
 *
 * Wall clock IF the runtime clock is plausibly real (year >= 2024 — preview
 * and device both keep real time), otherwise session-relative T+MM:SS. The
 * fallback exists because a fabricated wall-clock time is worse than an
 * honest relative one; which source is in use is logged once at boot.
 *
 * Hard rule 1: Title / Row_1..8 / CloseChip exist in the scene, disabled.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { eventBus, Events } from "../Engine/EventBus";
import { MenuChipPayload, TrailStatePayload } from "../Engine/NavTypes";
import { CampChangedPayload } from "../Engine/RequestTypes";
import { VisualConfig } from "../Engine/VisualConfig";
import { setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

const MAX_ROWS = 8;

interface JournalEntry {
  stamp: string;
  line: string;
  /** Advisory entries render dim; ordinary ones phosphor. */
  advisory: boolean;
}

@component
export class JournalPresenter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @input @hint("HUDRoot/Journal") private journal: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Copy</span>')

  @input @hint("Header line.") private titleText: string = "SESSION LOG";
  @input @hint("Shown in row 1 while the log is empty.") private emptyText: string = "NO ACTIVITY RECORDED THIS SESSION";
  @input @hint("Close chip label.") private closeLabel: string = "[ CLOSE ]";

  @input private enableDebugKeys: boolean = true;
  @input @hint("Toggle the journal — emits the SAME menuChipSelected the LOG chip and voice use. Right-hand cluster, off the movement keys.") private keyToggle: string = "V";
  @input private enableLogging: boolean = true;

  private title: Text | null = null;
  private rowTexts: (Text | null)[] = [];
  private closeChip: Text | null = null;

  private entries: JournalEntry[] = [];
  private open: boolean = false;
  private mode: string = "IDLE";
  private wallClock: boolean = false;
  private sessionStartSec: number = 0;
  private wasRecording: boolean = false;
  private lastTrailCount: number = 0;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[JOURNAL] " + msg);
  }

  private onStart(): void {
    this.sessionStartSec = getTime();
    // Trust the clock only if it claims a plausible present. A device with a
    // dead RTC reports the epoch; stamping entries "00:03" from 1970 would be
    // a fabricated time, which is worse than an honest relative one.
    try {
      this.wallClock = new Date().getFullYear() >= 2024;
    } catch (e) {
      this.wallClock = false;
    }
    this.log("ready. timestamps=" + (this.wallClock ? "wall-clock (runtime Date)" : "session-relative T+"));

    this.collect();

    // --- the sources: events that already exist. No new engine state. -------
    eventBus.subscribe(Events.surveyComplete, (p: any) => {
      const sites = p && p.sites ? p.sites.length : 0;
      this.record("AREA SCAN COMPLETE · " + sites + " SITE" + (sites === 1 ? "" : "S") + " RATED", false);
    });
    eventBus.subscribe(Events.hazardsDetected, (p: any) => {
      const n = p && p.hazards ? p.hazards.length : 0;
      if (n > 0) this.record("HAZARDS FLAGGED · " + n, true);
    });
    eventBus.subscribe(Events.lessonCompleted, (p: { title: string }) => {
      this.record("TASK COMPLETE · " + ((p && p.title) || "").toUpperCase(), false);
    });
    eventBus.subscribe(Events.campChanged, (p: CampChangedPayload) => {
      this.record("CAMP POINT " + (p && p.source === "manual" ? "SET" : "REGISTERED"), false);
    });
    eventBus.subscribe(Events.trailStateChanged, (p: TrailStatePayload) => {
      if (!p) return;
      // Edges only: the recorder emits on every dropped mark, and eight rows
      // of "mark added" would be the whole journal.
      if (p.recording && !this.wasRecording) this.record("TRAIL RECORDING STARTED", false);
      if (!p.recording && this.wasRecording) {
        this.record("TRAIL SAVED · " + p.markCount + " MARKS", false);
      }
      this.wasRecording = p.recording;
      this.lastTrailCount = p.markCount;
    });
    eventBus.subscribe(Events.distanceWarning, (p: { message: string }) => {
      if (p && p.message) this.record("ADVISORY · " + p.message, true);
    });

    // --- open/close ---------------------------------------------------------
    eventBus.subscribe(Events.menuChipSelected, (p: MenuChipPayload) => {
      if (!p || p.chip !== "journal") return;
      this.setOpen(!this.open, p.source);
    });
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      this.mode = p ? p.to : "IDLE";
      // The journal is an IDLE surface; anything else takes the screen.
      if (this.open && this.mode !== "IDLE") this.setOpen(false, "modeChange");
    });

    setEnabled(this.journal, false);

    if (this.enableDebugKeys) {
      const letter = (this.keyToggle || "").toUpperCase().charAt(0);
      const idx = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(letter);
      const key = idx >= 0 ? ((Keys.A + idx) as Keys) : Keys.Invalid;
      this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
        // The same event the LOG chip and the voice twin emit — no parallel path.
        if (e.key === key) eventBus.emit(Events.menuChipSelected, { chip: "journal", source: "debugKey" });
      });
    }
  }

  private collect(): void {
    if (!this.journal) {
      this.log("journal not wired — nothing to drive");
      return;
    }
    const find = (name: string): SceneObject | null => {
      for (let i = 0; i < this.journal.getChildrenCount(); i++) {
        if (this.journal.getChild(i).name === name) return this.journal.getChild(i);
      }
      return null;
    };
    const textOf = (obj: SceneObject | null): Text | null =>
      obj ? (obj.getComponent("Component.Text") as Text) : null;

    const font = this.theme ? this.theme.font : null;

    this.title = textOf(find("Title"));
    setFont(this.title, font);

    this.rowTexts = [];
    for (let i = 1; i <= MAX_ROWS; i++) {
      const t = textOf(find("Row_" + i));
      setFont(t, font);
      this.rowTexts.push(t);
    }

    const chipObj = find("CloseChip");
    this.closeChip = textOf(chipObj);
    setFont(this.closeChip, font);
    if (chipObj) {
      const interactable = chipObj.getComponent(Interactable.getTypeName()) as Interactable;
      if (interactable) {
        interactable.onTriggerEnd.add(() => {
          if (this.open) this.setOpen(false, "pinch");
        });
      }
    }
  }

  // ------------------------------------------------------------------ record

  private record(line: string, advisory: boolean): void {
    this.entries.push({ stamp: this.stamp(), line: line, advisory: advisory });
    // Hard cap 8 — the display has eight pre-made rows. Most recent win.
    while (this.entries.length > MAX_ROWS) this.entries.shift();
    if (this.open) this.render();
  }

  private stamp(): string {
    if (this.wallClock) {
      try {
        const d = new Date();
        return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
      } catch (e) {
        // fall through to relative
      }
    }
    const s = Math.max(0, Math.floor(getTime() - this.sessionStartSec));
    return "T+" + pad2(Math.floor(s / 60)) + ":" + pad2(s % 60);
  }

  // ------------------------------------------------------------- open/close

  private setOpen(open: boolean, source: string): void {
    if (this.open === open) return;
    if (open && this.mode !== "IDLE") {
      this.log("open refused — mode is " + this.mode);
      return;
    }
    this.open = open;
    this.log((open ? "opened" : "closed") + " via " + source);
    // The menu listens and yields/reclaims the screen — boot-intro pattern.
    eventBus.emit(Events.journalStateChanged, { open: open });
    setEnabled(this.journal, open);
    if (open) {
      enableSubtree(this.journal);
      this.render();
    }
  }

  private render(): void {
    const theme = this.theme;
    setText(this.title, this.titleText);
    setText(this.closeChip, this.closeLabel);
    if (theme) {
      setTextColor(this.title, theme.primaryPhosphor, theme.glowIntensity);
      setTextColor(this.closeChip, theme.primaryPhosphor, theme.glowIntensity * 0.8);
    }

    // Newest at the top — the row you glance at is the thing that just happened.
    for (let i = 0; i < MAX_ROWS; i++) {
      const t = this.rowTexts[i];
      if (!t) continue;
      const entry = this.entries[this.entries.length - 1 - i];
      if (entry) {
        setText(t, entry.stamp + "  " + entry.line);
        if (theme) {
          setTextColor(t, entry.advisory ? theme.dimColor : theme.primaryPhosphor, theme.glowIntensity * (entry.advisory ? 0.75 : 0.9));
        }
      } else if (i === 0 && this.entries.length === 0) {
        setText(t, this.emptyText);
        if (theme) setTextColor(t, theme.dimColor, theme.glowIntensity * 0.7);
      } else {
        setText(t, "");
      }
    }
  }
}

function pad2(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

/** Enable an object and every descendant — hard rule 1's "whole chain" note. */
function enableSubtree(obj: SceneObject): void {
  obj.enabled = true;
  for (let i = 0; i < obj.getChildrenCount(); i++) enableSubtree(obj.getChild(i));
}
