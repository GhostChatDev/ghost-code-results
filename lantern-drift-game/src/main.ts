import "./style.css";
import { AudioEngine } from "./game/audio";
import { InputController } from "./game/input";
import { loadLevels } from "./game/levels";
import { FixedStepDriver } from "./game/loop";
import { formatTime, ProgressStore } from "./game/progress";
import { Simulation } from "./game/simulation";
import type { Level } from "./game/types";
import { LevelEditor } from "./editor";
import { Renderer } from "./renderer";

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing interface element: ${selector}`);
  return node;
};
const escapeHTML = (value: string): string => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let levels: Level[] = [];
const store = new ProgressStore(typeof localStorage === "undefined" ? null : localStorage);
const audio = new AudioEngine(!store.data.sound);
const input = new InputController();
const driver = new FixedStepDriver();
const canvas = $<HTMLCanvasElement>("#game-canvas");
const renderer = new Renderer(canvas);
let simulation: Simulation | null = null;
let activeLevel = 0;
let playing = false;
let editorOpen = false;
let editor: LevelEditor | null = null;
let lastScreen = "title-screen";
let lastFrame = 0;
let lastSecond = -1;
let completeLock = false;

function toast(message: string): void {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(Number(node.dataset.timer || 0));
  node.dataset.timer = String(window.setTimeout(() => node.classList.remove("show"), 3200));
}

function showScreen(id: string | null): void {
  if (id) lastScreen = id;
  document.querySelectorAll<HTMLElement>(".screen").forEach((screen) => {
    screen.hidden = screen.id !== id;
    screen.classList.toggle("is-visible", screen.id === id);
  });
  $("#game-stage").classList.toggle("in-game", id === null);
  $("#hud").hidden = !(id === null && simulation && !editorOpen);
  input.setEnabled(id === null && playing);
  driver.reset();
  lastSecond = -1;
}

function updateHUD(): void {
  if (!simulation) return;
  $("#flame-fill").style.width = `${Math.round(simulation.flame * 100)}%`;
  $("#flame-value").textContent = `${Math.round(simulation.flame * 100)}%`;
  $("#hud-fireflies").textContent = `${simulation.collected.size} / ${simulation.level.fireflies.length}`;
  $("#hud-time").textContent = formatTime(simulation.elapsed);
  $("#hud-level").textContent = simulation.level.name;
  $("#wind-indicator").textContent = simulation.wind === 0 ? "Calm air" : `${simulation.wind > 0 ? "→" : "←"} Wind ${Math.abs(simulation.wind).toFixed(1)}`;
  if (Math.floor(simulation.elapsed) !== lastSecond) {
    $("#checkpoint-label").textContent = simulation.checkpointReached ? "Checkpoint kindled" : "Find the checkpoint";
    lastSecond = Math.floor(simulation.elapsed);
  }
}

function applySettings(): void {
  audio.setMuted(!store.data.sound);
  $<HTMLInputElement>("#sound-setting").checked = store.data.sound;
  $<HTMLInputElement>("#motion-setting").checked = store.data.reducedMotion;
  document.documentElement.classList.toggle("reduced-motion", store.data.reducedMotion);
}

async function boot(): Promise<void> {
  applySettings();
  input.mount($("#touch-controls"));
  input.onPause = () => { if (playing) pauseGame(); else if (lastScreen === "pause-screen") resumeGame(); };
  window.addEventListener("resize", () => renderer.resize());
  try {
    levels = await loadLevels((message) => toast(message));
    $("#campaign-summary").textContent = `${levels.length} handmade journeys · progress saved on this device`;
    renderLevelCards();
    startLevel(0, true);
    showScreen("title-screen");
  } catch (error) {
    showScreen("title-screen");
    $("#campaign-summary").textContent = "The city maps could not be loaded.";
    toast(error instanceof Error ? error.message : String(error));
  }
  requestAnimationFrame(frame);
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // A blocked worker does not stop online play.
    });
  }
}

function startLevel(index: number, preview = false): void {
  const level = preview && levels[0] ? levels[0] : levels[index];
  if (!level) { toast("No journey is available. Try importing a level in the workshop."); return; }
  if (!preview && index >= store.data.unlocked) { toast("Complete the previous journey to unlock this one."); return; }
  activeLevel = index;
  editorOpen = false;
  simulation = new Simulation(level);
  completeLock = false;
  renderer.render(level, simulation.snapshot(), store.data.reducedMotion);
  playing = !preview;
  $("#quit-button").textContent = "Level select";
  showScreen(preview ? "title-screen" : null);
  updateHUD();
}

function startCustom(level: Level): void {
  simulation = new Simulation(level);
  activeLevel = 0;
  editorOpen = false;
  completeLock = false;
  playing = true;
  $("#quit-button").textContent = "Back to editor";
  showScreen(null);
  updateHUD();
}

function pauseGame(): void {
  if (!simulation || editorOpen) return;
  playing = false;
  showScreen("pause-screen");
}

function resumeGame(): void {
  if (!simulation) return;
  playing = true;
  showScreen(null);
  void audio.unlock();
}

function completeLevel(): void {
  if (!simulation || completeLock) return;
  completeLock = true;
  playing = false;
  const custom = simulation.level.id.startsWith("custom");
  const count = simulation.collected.size;
  let best = store.data.bestTimes[simulation.level.id];
  if (!custom) {
    store.complete(simulation.level.id, simulation.level.order, simulation.elapsed, [...simulation.collected]);
    best = store.data.bestTimes[simulation.level.id];
  }
  audio.play("exit");
  $("#complete-time").textContent = formatTime(simulation.elapsed);
  $("#complete-fireflies").textContent = `${count} / ${simulation.level.fireflies.length}`;
  $("#complete-best").textContent = custom ? "Not saved for play-tests" : formatTime(best ?? simulation.elapsed);
  $("#next-level").hidden = custom || activeLevel >= levels.length - 1;
  $("#complete-kicker").textContent = custom ? "Play-test complete" : `Journey ${activeLevel + 1} complete`;
  showScreen("complete-screen");
  renderLevelCards();
}

function renderLevelCards(): void {
  const grid = $("#level-grid");
  grid.replaceChildren();
  for (const [index, level] of levels.entries()) {
    const unlocked = index < store.data.unlocked;
    const best = store.data.bestTimes[level.id];
    const button = document.createElement("button");
    button.className = `level-card${unlocked ? "" : " locked"}`;
    button.disabled = !unlocked;
    button.setAttribute("aria-label", unlocked ? `Play ${level.name}` : `${level.name}, locked`);
    button.innerHTML = `<span class="level-number">${String(index + 1).padStart(2, "0")}</span><span class="level-state">${unlocked ? (best !== undefined ? "Kindled" : "Open") : "Locked"}</span><h3>${escapeHTML(level.name)}</h3><p>${escapeHTML(level.subtitle)}</p><span class="level-meta">${best !== undefined ? `Best ${formatTime(best)}` : `${level.fireflies.length} fireflies · ${level.enemies.length} spirits`}</span>`;
    button.addEventListener("click", () => startLevel(index));
    grid.append(button);
  }
  const complete = levels.filter((level) => store.data.bestTimes[level.id] !== undefined).length;
  const flies = Object.values(store.data.fireflies).reduce((sum, ids) => sum + ids.length, 0);
  $("#progress-summary").textContent = `${complete} / ${levels.length} journeys complete · ${flies} fireflies gathered`;
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const elapsed = lastFrame ? now - lastFrame : 16;
  lastFrame = now;
  if (!simulation) return;
  if (playing) {
    const steps = driver.advance(now, simulation, input.input);
    const events = steps ? simulation.events.splice(0) : [];
    if (steps) input.consumeJump();
    for (const event of events) {
      if (event === "complete") completeLevel();
      else {
        audio.play(event === "extinguish" ? "death" : event === "land" ? "click" : event);
        if (event === "checkpoint") toast("Checkpoint kindled · your spark is safe here");
        if (event === "extinguish") toast("The flame went out · returning to your checkpoint…");
      }
    }
    if (playing) updateHUD();
  } else driver.reset();
  // Keep menus alive at 30 fps; active gameplay renders every animation frame.
  if (playing || elapsed >= 32) renderer.render(simulation.level, simulation.snapshot(), store.data.reducedMotion);
}

$("#continue-button").addEventListener("click", () => startLevel(Math.min(store.data.unlocked - 1, levels.length - 1)));
$("#levels-button").addEventListener("click", () => { renderLevelCards(); showScreen("levels-screen"); });
$("#settings-button").addEventListener("click", () => showScreen("settings-screen"));
$("#editor-button").addEventListener("click", openEditor);
document.querySelectorAll<HTMLButtonElement>("[data-title]").forEach((button) => button.addEventListener("click", () => {
  simulation = null; playing = false; editorOpen = false; showScreen("title-screen");
}));
$("#pause-button").addEventListener("click", pauseGame);
$("#resume-button").addEventListener("click", resumeGame);
$("#restart-button").addEventListener("click", () => {
  if (simulation?.level.id.startsWith("custom")) startCustom(simulation.level);
  else startLevel(activeLevel);
});
$("#pause-settings-button").addEventListener("click", () => showScreen("settings-screen"));
$("#quit-button").addEventListener("click", () => {
  if (simulation?.level.id.startsWith("custom")) openEditor();
  else { playing = false; renderLevelCards(); showScreen("levels-screen"); }
});
$("#retry-button").addEventListener("click", () => {
  if (simulation?.level.id.startsWith("custom")) startCustom(simulation.level);
  else startLevel(activeLevel);
});
$("#next-level").addEventListener("click", () => startLevel(Math.min(activeLevel + 1, levels.length - 1)));
$("#complete-levels-button").addEventListener("click", () => {
  if (simulation?.level.id.startsWith("custom")) openEditor();
  else { renderLevelCards(); showScreen("levels-screen"); }
});
$("#sound-setting").addEventListener("change", (event) => {
  store.settings((event.target as HTMLInputElement).checked, store.data.reducedMotion); applySettings();
});
$("#motion-setting").addEventListener("change", (event) => {
  store.settings(store.data.sound, (event.target as HTMLInputElement).checked); applySettings();
});
$("#settings-back").addEventListener("click", () => showScreen(simulation && !playing && !editorOpen ? "pause-screen" : "title-screen"));
window.addEventListener("blur", () => { if (playing) pauseGame(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && playing) pauseGame(); });
document.addEventListener("pointerdown", () => { void audio.unlock(); }, { once: true });
document.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("button")) audio.play("click");
});

function openEditor(): void {
  editorOpen = true;
  playing = false;
  editor ??= new LevelEditor($("#editor-root"), { play: startCustom, error: toast });
  editor.show();
  showScreen("editor-screen");
}

// A failed campaign request still leaves the editor available; no level is treated as valid blindly.
void boot();
