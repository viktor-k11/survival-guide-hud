/**
 * KeyboardInput — typing as a second route into the SAME request seam.
 *
 * `VoiceInput` emits `userRequest { text, latencyMs }` and everything
 * downstream — the navigation keyword matcher, the lesson coordinator, the Q&A
 * router — listens there. This emits the identical event from the AR keyboard,
 * so a typed request is indistinguishable from a spoken one by the time it
 * reaches the engine. No parallel path, nothing to keep in sync.
 *
 * It exists because voice is the riskiest part of a live demo: a noisy room, a
 * mic permission prompt, or one bad transcription and the centrepiece of the
 * video is a Lens that appears not to work. Typing is the fallback that always
 * lands.
 *
 * ## Preview cannot show this
 *
 * The AR keyboard does not render in Lens Studio Preview under SPECS 27
 * simulation — `requestKeyboard()` is accepted and `onKeyboardStateChanged`
 * fires, but no keys are drawn. That is a documented platform limitation, not a
 * wiring fault. `debugSubmitText` exists for exactly this: it pushes a canned
 * string through the same `submit()` the keyboard's return key calls, so the
 * seam is provable on a desk and the keyboard itself is verified on device.
 */
import { eventBus, Events } from "./EventBus";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

@component
export class KeyboardInput extends BaseScriptComponent {
  @input
  @hint("Text shown in the keyboard preview strip before the user types.")
  private initialText: string = "";

  @input
  @hint("Placeholder-style hint printed to the log when the keyboard opens.")
  private promptHint: string = "Type a request, e.g. help me purify water";

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Debug — the keyboard does not draw in Preview</span>')

  @input private enableDebugKeys: boolean = true;

  @input
  @hint("Opens the AR keyboard. On device this is the real thing; in Preview it opens and draws nothing.")
  private keyOpenKeyboard: string = "I";

  @input
  @hint("Pushes debugSubmitText through the SAME submit path the return key uses. This is how the seam gets proven without a keyboard.")
  private keyDebugSubmit: string = "U";

  @input private debugSubmitText: string = "how do I signal for rescue";

  @input private enableLogging: boolean = true;

  private open: boolean = false;
  private currentText: string = "";

  onAwake(): void {
    // Loading the module at awake keeps the first open snappy; requesting the
    // keyboard itself must wait for OnStart like every other system here.
    require("LensStudio:TextInputModule");
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private log(msg: string): void {
    if (this.enableLogging) print("[KEYS] " + msg);
  }

  private onStart(): void {
    eventBus.subscribe(Events.keyboardRequested, (p: { source: string }) => {
      this.show(p ? p.source : "bus");
    });

    if (this.enableDebugKeys) this.bindDebugKeys();

    this.log(
      "ready. debugKeys=" + (this.enableDebugKeys ? this.keyOpenKeyboard + " open / " + this.keyDebugSubmit + " submit" : "off")
    );
  }

  /** Open the AR keyboard. Safe to call twice; the second call is ignored. */
  public show(source: string): void {
    if (this.open) {
      this.log("already open (" + source + ")");
      return;
    }

    const options = new TextInputSystem.KeyboardOptions();
    options.enablePreview = true;
    options.keyboardType = TextInputSystem.KeyboardType.Text;
    options.returnKeyType = TextInputSystem.ReturnKeyType.Send;
    options.initialText = this.initialText;

    this.currentText = this.initialText;

    options.onTextChanged = (text: string) => {
      this.currentText = text;
    };
    options.onReturnKeyPressed = () => {
      const text = this.currentText;
      global.textInputSystem.dismissKeyboard();
      this.submit(text, "keyboard");
    };
    options.onKeyboardStateChanged = (isOpen: boolean) => {
      this.open = isOpen;
      this.log("keyboard " + (isOpen ? "opened — " + this.promptHint : "closed"));
    };
    options.onError = (error: number, description: string) => {
      this.open = false;
      this.log("ERROR " + error + ": " + description);
    };

    global.textInputSystem.requestKeyboard(options);
    this.log("requestKeyboard (" + source + ")");
  }

  public dismiss(): void {
    if (!this.open) return;
    global.textInputSystem.dismissKeyboard();
  }

  /**
   * THE seam. Identical to what VoiceInput emits, so nothing downstream can
   * tell a typed request from a spoken one.
   */
  public submit(text: string, source: string): void {
    const clean = (text || "").trim();
    if (clean.length === 0) {
      this.log("empty submit ignored");
      return;
    }
    this.log('submit (' + source + ') "' + clean + '" -> userRequest');
    eventBus.emit(Events.userRequest, { text: clean, latencyMs: 0 });
  }

  private keyFromLetter(letter: string): Keys {
    const idx = LETTERS.indexOf((letter || "").toUpperCase().charAt(0));
    if (idx < 0) return Keys.Invalid;
    return (Keys.A + idx) as Keys;
  }

  private bindDebugKeys(): void {
    const openKey = this.keyFromLetter(this.keyOpenKeyboard);
    const submitKey = this.keyFromLetter(this.keyDebugSubmit);
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      // Emit rather than calling show() directly, so the debug key travels the
      // SAME seam the status-bar chip does. Calling straight through skipped
      // the bus and anything listening to it (SfxService) never heard the key
      // — the same bypass HudRecenter had.
      if (e.key === openKey) eventBus.emit(Events.keyboardRequested, { source: "debugKey" });
      else if (e.key === submitKey) this.submit(this.debugSubmitText, "debugKey");
    });
  }
}
