import type { InputState } from "./types";

type Action = keyof InputState | "pause";
const KEYS: Record<string, Action> = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  ArrowUp: "jump", KeyW: "jump", Space: "jump", Escape: "pause", KeyP: "pause",
};

export class InputController {
  readonly input: InputState = { left: false, right: false, jump: false, jumpPressed: false };
  private previousJump = false;
  onPause: (() => void) | undefined;
  private held = new Map<string, Action>();
  private pointers = new Map<number, Action>();
  private enabled = false;
  private controls: HTMLElement | undefined;
  private disposers: (() => void)[] = [];

  mount(controls: HTMLElement) {
    this.controls = controls;
    for (const button of controls.querySelectorAll<HTMLButtonElement>("[data-control]")) {
      const action = button.dataset.control as Action;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (!this.enabled) return;
        button.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, action);
        button.classList.add("is-held");
        this.sync();
      });
      const release = (event: PointerEvent) => {
        this.pointers.delete(event.pointerId);
        button.classList.remove("is-held");
        this.sync();
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    }
    window.addEventListener("keydown", this.keyDown, { passive: false });
    window.addEventListener("keyup", this.keyUp, { passive: false });
    window.addEventListener("blur", this.clear);
    this.disposers.push(() => window.removeEventListener("keydown", this.keyDown));
    this.disposers.push(() => window.removeEventListener("keyup", this.keyUp));
    this.disposers.push(() => window.removeEventListener("blur", this.clear));
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.controls) this.controls.hidden = !enabled;
    if (!enabled) this.clear();
  }

  private keyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    const action = KEYS[event.code];
    if (!action) return;
    if (this.enabled) event.preventDefault();
    if (action === "pause") {
      if (!event.repeat) this.onPause?.();
      return;
    }
    if (!this.enabled) return;
    this.held.set(event.code, action);
    this.sync();
  };

  private keyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
    this.sync();
  };

  private clear = () => {
    this.held.clear();
    this.pointers.clear();
    this.sync();
  };

  private sync() {
    const actions = [...this.held.values(), ...this.pointers.values()];
    this.input.left = actions.includes("left");
    this.input.right = actions.includes("right");
    this.input.jump = actions.includes("jump");
    this.input.jumpPressed = this.input.jump && !this.previousJump;
    this.previousJump = this.input.jump;
  }

  consumeJump() {
    this.input.jumpPressed = false;
  }

  destroy() {
    this.disposers.forEach((dispose) => dispose());
    this.clear();
  }
}
