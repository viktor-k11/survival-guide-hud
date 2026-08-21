/**
 * CompletionCard presenter — the end-of-lesson card, and the home of the
 * next-step suggestion line.
 *
 * lessonCompleted -> show the card: title line, and (when the plan offered
 * one) the suggestion as ONE chevron line that is both readable copy and a
 * pinch target. Accepting is the user's act — pinch here (emits
 * suggestionAccepted; the ENGINE owns what acceptance means) or voice
 * ("yes" / "do it" / "next", matched locally in the engine). Nothing in this
 * file starts anything: hard rule 3, and the product rule that the guide
 * never acts on its own initiative.
 *
 * Hard rule 1: TitleLine / NextLine / HintLine exist in the scene, disabled.
 * This enables, populates, and nothing else.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { eventBus, Events } from "../Engine/EventBus";
import { VisualConfig } from "../Engine/VisualConfig";
import { setEnabled, setFont, setText, setTextColor } from "./WidgetUtils";

@component
export class CompletionCardPresenter extends BaseScriptComponent {
  @input private theme: VisualConfig;

  @input @hint("HUDRoot/CompletionCard") private card: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Copy</span>')

  @input @hint("Title line. {T} = the lesson title, uppercased.") private titleFormat: string = "TASK COMPLETE · {T}";
  @input @hint("Chevron prefix on the suggestion line. ASCII on purpose — the same '>' the prompt line uses, guaranteed present in the font.") private nextPrefix: string = "> NEXT: ";
  @input @hint("Hint under the suggestion.") private hintWithNext: string = 'SAY "YES" OR PINCH THE LINE — OR JUST WALK AWAY';
  @input @hint("Hint when the lesson offered no next step.") private hintPlain: string = "RETURNING TO TERMINAL";

  @input private enableLogging: boolean = true;

  private titleLine: Text | null = null;
  private nextLine: Text | null = null;
  private hintLine: Text | null = null;
  private nextLineRoot: SceneObject | null = null;
  private hasSuggestion: boolean = false;

  onAwake(): void {
    // SIK subscriptions must bind in OnStartEvent, not onAwake.
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[CARD] " + msg);
  }

  private onStart(): void {
    if (!this.card) {
      this.log("card not wired — nothing to drive");
      return;
    }

    const find = (name: string): SceneObject | null => {
      for (let i = 0; i < this.card.getChildrenCount(); i++) {
        if (this.card.getChild(i).name === name) return this.card.getChild(i);
      }
      return null;
    };
    const textOf = (obj: SceneObject | null): Text | null =>
      obj ? (obj.getComponent("Component.Text") as Text) : null;

    const titleObj = find("TitleLine");
    this.nextLineRoot = find("NextLine");
    const hintObj = find("HintLine");
    this.titleLine = textOf(titleObj);
    this.nextLine = textOf(this.nextLineRoot);
    this.hintLine = textOf(hintObj);

    const font = this.theme ? this.theme.font : null;
    setFont(this.titleLine, font);
    setFont(this.nextLine, font);
    setFont(this.hintLine, font);

    // Pinch on the suggestion line = acceptance. Relaying the act is not
    // logic; the engine decides what it means (and ignores a stale one).
    if (this.nextLineRoot) {
      const interactable = this.nextLineRoot.getComponent(Interactable.getTypeName()) as Interactable;
      if (interactable) {
        interactable.onTriggerEnd.add(() => {
          if (!this.hasSuggestion) return;
          this.log("suggestionAccepted via pinch");
          eventBus.emit(Events.suggestionAccepted, { source: "pinch" });
        });
      } else {
        this.log("NextLine has no SIK Interactable — voice still works");
      }
    }

    eventBus.subscribe(
      Events.lessonCompleted,
      (p: { title: string; nextSuggestion?: string }) => this.show(p)
    );
    // The suggestion is a SEPARATE background call, so it lands a few seconds
    // after the card is already up. The card gains its next line then; an empty
    // result simply leaves the card as it is.
    eventBus.subscribe(Events.nextStepSuggested, (p: { text: string }) => {
      const text = p && p.text ? p.text : "";
      if (text.length === 0 || !this.card || !this.card.enabled) return;
      this.setNextLine(text);
      this.log('next line arrived: "' + text + '"');
    });
    // ANY exit from COMPLETE retires the card — accept, decline, dwell, stop.
    eventBus.subscribe(Events.modeChanged, (p: { to: string }) => {
      if (!p || p.to !== "COMPLETE") setEnabled(this.card, false);
    });

    setEnabled(this.card, false);
    this.log("ready");
  }

  private show(p: { title: string; nextSuggestion?: string }): void {
    if (!this.card) return;
    const theme = this.theme;
    const suggestion = p && p.nextSuggestion ? p.nextSuggestion : "";
    this.hasSuggestion = suggestion.length > 0;

    setEnabled(this.card, true);
    setEnabled(this.titleLine ? this.titleLine.sceneObject : null, true);
    setEnabled(this.hintLine ? this.hintLine.sceneObject : null, true);
    // A missing suggestion means the card simply has no next line.
    setEnabled(this.nextLineRoot, this.hasSuggestion);

    setText(this.titleLine, this.titleFormat.replace("{T}", (p && p.title ? p.title : "").toUpperCase()));
    if (this.hasSuggestion) setText(this.nextLine, this.nextPrefix + suggestion.toUpperCase());
    setText(this.hintLine, this.hasSuggestion ? this.hintWithNext : this.hintPlain);

    if (theme) {
      setTextColor(this.titleLine, theme.primaryPhosphor, theme.glowIntensity);
      setTextColor(this.nextLine, theme.accentAmber, theme.glowIntensity);
      setTextColor(this.hintLine, theme.dimColor, theme.glowIntensity * 0.7);
    }
    this.log("shown" + (this.hasSuggestion ? ' with suggestion "' + suggestion + '"' : " (waiting for a suggestion)"));
  }

  /** Adds (or replaces) the card's next line once a suggestion is in hand. */
  private setNextLine(suggestion: string): void {
    this.hasSuggestion = true;
    setEnabled(this.nextLineRoot, true);
    setText(this.nextLine, this.nextPrefix + suggestion.toUpperCase());
    setText(this.hintLine, this.hintWithNext);
    if (this.theme) {
      setTextColor(this.nextLine, this.theme.accentAmber, this.theme.glowIntensity);
      setTextColor(this.hintLine, this.theme.dimColor, this.theme.glowIntensity * 0.7);
    }
  }
}
