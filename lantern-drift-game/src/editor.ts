import { clamp } from "./game/constants";
import { parseLevel, validateLevel } from "./game/validation";
import type { EnemyKind, Level, PlatformDef, Point, Rect, WindZone } from "./game/types";

type Tool = "solid" | "erase" | "spawn" | "checkpoint" | "exit" | "candle" | "firefly" | "platform" | "wind" | EnemyKind;
type Selection = { kind: "platform" | "wind" | "enemy"; id: string } | null;
interface EditorOptions { play: (level: Level) => void; error: (message: string) => void }

const STORAGE_KEY = "lantern-drift.editor.v1";
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function blankLevel(): Level {
  const width = 48, height = 16;
  const tiles = Array.from({ length: height }, (_, y) => y >= 14 ? "#".repeat(width) : ".".repeat(width));
  const ledge = (y: number, start: number, end: number) => {
    const row = tiles[y].split(""); row.fill("#", start, end); tiles[y] = row.join("");
  };
  ledge(12, 12, 17); ledge(9, 23, 28);
  return {
    version: 1, id: "custom-workshop-draft", order: 1, name: "My rooftop", subtitle: "A small corner of the night city",
    width, height, tiles, spawn: { x: 2.2, y: 13.14 }, checkpoint: { x: 9.5, y: 13.14 },
    exit: { x: 45.1, y: 12, w: 0.8, h: 2 },
    candles: [{ id: "candle-1", x: 7.5, y: 14 }, { id: "candle-2", x: 25.5, y: 9 }],
    fireflies: [{ id: "firefly-1", x: 5.5, y: 11.5 }, { id: "firefly-2", x: 14.5, y: 10.5 }, { id: "firefly-3", x: 34.5, y: 8.5 }],
    winds: [{ id: "wind-1", x: 29, y: 5, w: 7, h: 7, force: 2.5 }],
    platforms: [{ id: "platform-1", x: 31, y: 11, w: 3, h: 0.35, axis: "horizontal", distance: 4, speed: 1, phase: 0 }],
    enemies: [
      { id: "moth-1", type: "moth", x: 20.1, y: 13.2, minX: 18, maxX: 23 },
      { id: "gust-1", type: "gust", x: 38.1, y: 10.2, minX: 36, maxX: 43 },
    ],
  };
}

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "solid", label: "Rooftop tile", hint: "Paint solid tiles" },
  { id: "erase", label: "Eraser", hint: "Remove tiles or objects" },
  { id: "spawn", label: "Lantern spawn", hint: "Place the starting point" },
  { id: "checkpoint", label: "Checkpoint", hint: "Place the respawn point" },
  { id: "exit", label: "Exit gate", hint: "Place the level exit" },
  { id: "candle", label: "Candle", hint: "Add a flame refill" },
  { id: "firefly", label: "Firefly", hint: "Add a collectible" },
  { id: "platform", label: "Moving platform", hint: "Add or select a platform" },
  { id: "wind", label: "Wind zone", hint: "Add or select a wind zone" },
  { id: "moth", label: "Patrolling moth", hint: "Add a moth enemy" },
  { id: "gust", label: "Gust spirit", hint: "Add a gust enemy" },
];

/** A grid editor whose draft stays independent from campaign progress and play-test state. */
export class LevelEditor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private level: Level = blankLevel();
  private tool: Tool = "solid";
  private selection: Selection = null;
  private tile = 20;
  private painting = false;
  private lastCell = "";
  private nextId = 1;
  private dirty = false;

  constructor(private readonly root: HTMLElement, private readonly options: EditorOptions) {
    root.innerHTML = `<div class="editor-toolbar" aria-label="Level actions">
      <button id="editor-play" class="button primary compact" type="button">Play-test draft</button>
      <button id="editor-export" class="button secondary compact" type="button">Export JSON</button>
      <label class="button secondary compact editor-file">Import JSON<input id="editor-import" type="file" accept=".json,application/json" hidden></label>
      <button id="editor-new" class="text-button" type="button">New draft</button>
    </div>
    <div class="editor-layout">
      <aside class="editor-palette" aria-label="Editor tools"><h3>Pieces</h3><div class="tool-grid">${TOOLS.map((tool) => `<button type="button" data-tool="${tool.id}" aria-pressed="${tool.id === "solid"}" title="${tool.hint}">${tool.label}</button>`).join("")}</div><p class="key-hint">Drag to paint. Right-click or use the eraser to remove. Select moving pieces to tune them.</p></aside>
      <div class="editor-main"><div class="editor-grid-scroll"><canvas id="editor-canvas" aria-label="Editable level grid"></canvas></div><div id="editor-validation" class="editor-validation" role="status"></div></div>
      <aside class="editor-inspector"><h3>Draft details</h3><label>Name<input id="editor-name" maxlength="60" autocomplete="off"></label><label>Subtitle<input id="editor-subtitle" maxlength="100" autocomplete="off"></label><div id="editor-properties"><p class="muted">Select a platform, wind zone or enemy to adjust its behaviour.</p></div></aside>
    </div>
    <details class="editor-json-panel"><summary>Level JSON <span>Edit directly, then apply and validate</span></summary><textarea id="editor-json" rows="14" spellcheck="false" aria-label="Level JSON source"></textarea><button id="editor-apply" class="button secondary compact" type="button">Apply & validate JSON</button></details>`;
    this.canvas = root.querySelector<HTMLCanvasElement>("#editor-canvas")!;
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not available in this browser.");
    this.ctx = context;
    this.loadDraft();
    this.bind();
    this.syncFields();
    this.commit(false);
  }

  show(): void { this.resize(); this.commit(false); }

  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => button.addEventListener("click", () => {
      this.tool = button.dataset.tool as Tool;
      this.root.querySelectorAll("[data-tool]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      this.root.querySelector<HTMLElement>("#editor-validation")!.textContent = `${TOOLS.find((tool) => tool.id === this.tool)?.hint}.`;
    }));
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault(); this.canvas.setPointerCapture(event.pointerId);
      this.painting = true; this.lastCell = ""; this.paint(event, event.button === 2 || event.ctrlKey);
    });
    this.canvas.addEventListener("pointermove", (event) => { if (this.painting) this.paint(event, (event.buttons & 2) !== 0 || event.ctrlKey); });
    const stop = () => { this.painting = false; this.lastCell = ""; };
    this.canvas.addEventListener("pointerup", stop); this.canvas.addEventListener("pointercancel", stop);
    for (const [selector, key] of [["#editor-name", "name"], ["#editor-subtitle", "subtitle"]] as const) {
      this.root.querySelector<HTMLInputElement>(selector)!.addEventListener("input", (event) => {
        this.level[key] = (event.target as HTMLInputElement).value; this.commit();
      });
    }
    this.root.querySelector("#editor-apply")!.addEventListener("click", () => this.applyJSON(this.jsonArea().value));
    this.root.querySelector("#editor-import")!.addEventListener("change", (event) => { void this.importFile(event); });
    this.root.querySelector("#editor-export")!.addEventListener("click", () => this.exportJSON());
    this.root.querySelector("#editor-play")!.addEventListener("click", () => this.play());
    this.root.querySelector("#editor-new")!.addEventListener("click", () => {
      if (!window.confirm("Start a new draft? Export your current level first if you want to keep it.")) return;
      this.level = blankLevel(); this.selection = null; this.nextId = 1; this.syncFields(); this.resize(); this.commit();
    });
    window.addEventListener("resize", () => { if (this.root.offsetParent !== null) this.resize(); });
  }

  private jsonArea(): HTMLTextAreaElement { return this.root.querySelector<HTMLTextAreaElement>("#editor-json")!; }
  private resize(): void {
    const available = this.canvas.parentElement?.clientWidth || 720;
    this.tile = clamp(available / this.level.width, 12, 30);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${this.level.width * this.tile}px`;
    this.canvas.style.height = `${this.level.height * this.tile}px`;
    this.canvas.width = Math.round(this.level.width * this.tile * dpr);
    this.canvas.height = Math.round(this.level.height * this.tile * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private cell(event: PointerEvent): Point | null {
    const bounds = this.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) / bounds.width * this.level.width);
    const y = Math.floor((event.clientY - bounds.top) / bounds.height * this.level.height);
    return x >= 0 && y >= 0 && x < this.level.width && y < this.level.height ? { x, y } : null;
  }

  private id(prefix: string): string {
    const used = new Set([...this.level.candles, ...this.level.fireflies, ...this.level.winds, ...this.level.platforms, ...this.level.enemies].map((item) => item.id));
    while (used.has(`${prefix}-${this.nextId}`)) this.nextId++;
    return `${prefix}-${this.nextId++}`;
  }

  private paint(event: PointerEvent, erase: boolean): void {
    const cell = this.cell(event);
    if (!cell) return;
    const key = `${cell.x},${cell.y},${erase}`;
    if (key === this.lastCell) return;
    this.lastCell = key;
    const { x, y } = cell;
    const tool = erase ? "erase" : this.tool;
    if (tool === "solid" || tool === "erase") {
      const existing = this.findAt(x, y);
      if (tool === "erase" && existing) {
        if (existing.kind === "platform") this.level.platforms = this.level.platforms.filter((p) => p.id !== existing.id);
        else if (existing.kind === "wind") this.level.winds = this.level.winds.filter((w) => w.id !== existing.id);
        else this.level.enemies = this.level.enemies.filter((e) => e.id !== existing.id);
        this.level.candles = this.level.candles.filter((c) => Math.floor(c.x) !== x || Math.floor(c.y - 0.01) !== y);
        this.level.fireflies = this.level.fireflies.filter((f) => Math.floor(f.x) !== x || Math.floor(f.y) !== y);
        this.selection = null;
      } else {
        const row = this.level.tiles[y].split("");
        row[x] = tool === "solid" ? "#" : ".";
        this.level.tiles[y] = row.join("");
      }
    } else if (tool === "spawn") this.level.spawn = { x: x + 0.2, y: y + 0.14 };
    else if (tool === "checkpoint") this.level.checkpoint = { x: x + 0.5, y: y + 0.14 };
    else if (tool === "exit") this.level.exit = { x: x + 0.1, y: clamp(y - 1, 0, this.level.height - 2), w: 0.8, h: 2 };
    else if (tool === "candle") this.level.candles.push({ id: this.id("candle"), x: x + 0.5, y: Math.min(y + 1, this.level.height - 0.01) });
    else if (tool === "firefly") this.level.fireflies.push({ id: this.id("firefly"), x: x + 0.5, y: y + 0.5 });
    else if (tool === "platform") {
      const hit = this.level.platforms.find((p) => x >= p.x - 0.2 && x <= p.x + p.w && y >= p.y - 0.3 && y <= p.y + p.h + 0.3);
      if (hit) this.selection = { kind: "platform", id: hit.id };
      else {
        const platform: PlatformDef = { id: this.id("platform"), x, y: y + 0.3, w: Math.min(3, this.level.width - x), h: 0.35, axis: "horizontal", distance: 3, speed: 1, phase: 0 };
        this.level.platforms.push(platform);
        this.selection = { kind: "platform", id: platform.id };
      }
    } else if (tool === "wind") {
      const hit = this.level.winds.find((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h);
      if (hit) this.selection = { kind: "wind", id: hit.id };
      else {
        const wind: WindZone = { id: this.id("wind"), x, y, w: Math.min(6, this.level.width - x), h: Math.min(6, this.level.height - y), force: 3 };
        this.level.winds.push(wind);
        this.selection = { kind: "wind", id: wind.id };
      }
    } else {
      const type: EnemyKind = tool;
      const enemy = { id: this.id(type), type, x: x + 0.1, y: y + 0.2, minX: Math.max(0, x - 3), maxX: Math.min(this.level.width, x + 4) };
      this.level.enemies.push(enemy);
      this.selection = { kind: "enemy", id: enemy.id };
    }
    this.renderProperties();
    this.commit();
    this.draw();
  }

  private findAt(x: number, y: number): Selection {
    const p = this.level.platforms.find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h);
    if (p) return { kind: "platform", id: p.id };
    const w = this.level.winds.find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h);
    if (w) return { kind: "wind", id: w.id };
    const e = this.level.enemies.find((item) => Math.floor(item.x) === x && Math.floor(item.y) === y);
    return e ? { kind: "enemy", id: e.id } : null;
  }

  private renderProperties(): void {
    const panel = this.root.querySelector<HTMLElement>("#editor-properties")!;
    const selection = this.selection;
    if (!selection) { panel.innerHTML = '<p class="muted">Select a platform, wind zone or enemy to adjust its behaviour.</p>'; return; }
    const item = selection.kind === "platform" ? this.level.platforms.find((p) => p.id === selection.id)
      : selection.kind === "wind" ? this.level.winds.find((w) => w.id === selection.id)
        : this.level.enemies.find((e) => e.id === selection.id);
    if (!item) { this.selection = null; this.renderProperties(); return; }
    const entries: [string, number, number, number, number][] = "minX" in item
      ? [["x", item.x, 0, this.level.width - 0.1, 0.1], ["y", item.y, 0, this.level.height - 0.1, 0.1], ["minX", item.minX, 0, this.level.width, 0.5], ["maxX", item.maxX, 0, this.level.width, 0.5]]
      : "force" in item
        ? [["x", item.x, 0, this.level.width - 1, 0.5], ["y", item.y, 0, this.level.height - 1, 0.5], ["w", item.w, 0.5, this.level.width, 0.5], ["h", item.h, 0.5, this.level.height, 0.5], ["force", item.force, -20, 20, 0.5]]
        : [["x", item.x, 0, this.level.width - 0.1, 0.1], ["y", item.y, 0, this.level.height - 0.35, 0.1], ["w", item.w, 0.5, this.level.width, 0.5], ["distance", item.distance, 0, 20, 0.5], ["speed", item.speed, 0.1, 8, 0.1], ["phase", item.phase, -20, 20, 0.1]];
    panel.innerHTML = `<h3>${selection.kind === "enemy" ? "Enemy patrol" : selection.kind === "wind" ? "Wind behaviour" : "Platform motion"}</h3>${selection.kind === "platform" ? '<label>Axis<select data-axis><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>' : ""}${selection.kind === "enemy" ? '<label>Kind<select data-kind><option value="moth">Patrolling moth</option><option value="gust">Gust spirit</option></select></label>' : ""}<div class="property-grid">${entries.map(([key, value, min, max, step]) => `<label>${key}<input data-prop="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`).join("")}</div><button class="text-button danger" id="editor-delete" type="button">Remove selected piece</button>`;
    const axis = panel.querySelector<HTMLSelectElement>("[data-axis]");
    if (axis && selection.kind === "platform") { axis.value = (item as PlatformDef).axis; axis.addEventListener("change", () => { (item as PlatformDef).axis = axis.value as PlatformDef["axis"]; this.commit(); }); }
    const kind = panel.querySelector<HTMLSelectElement>("[data-kind]");
    if (kind && selection.kind === "enemy") { kind.value = (item as { type: EnemyKind }).type; kind.addEventListener("change", () => { (item as { type: EnemyKind }).type = kind.value as EnemyKind; this.commit(); this.draw(); }); }
    panel.querySelectorAll<HTMLInputElement>("[data-prop]").forEach((field) => field.addEventListener("input", () => {
      if (!Number.isFinite(field.valueAsNumber)) return;
      (item as unknown as Record<string, number>)[field.dataset.prop!] = field.valueAsNumber;
      this.commit(); this.draw();
    }));
    panel.querySelector<HTMLButtonElement>("#editor-delete")!.addEventListener("click", () => {
      if (selection.kind === "platform") this.level.platforms = this.level.platforms.filter((p) => p.id !== selection.id);
      else if (selection.kind === "wind") this.level.winds = this.level.winds.filter((w) => w.id !== selection.id);
      else this.level.enemies = this.level.enemies.filter((e) => e.id !== selection.id);
      this.selection = null; this.renderProperties(); this.commit(); this.draw();
    });
  }

  private syncFields(): void {
    this.root.querySelector<HTMLInputElement>("#editor-name")!.value = this.level.name;
    this.root.querySelector<HTMLInputElement>("#editor-subtitle")!.value = this.level.subtitle;
    this.jsonArea().value = JSON.stringify(this.level, null, 2);
    this.renderProperties();
  }

  private commit(save = true): void {
    const errors = validateLevel(this.level);
    const status = this.root.querySelector<HTMLElement>("#editor-validation")!;
    status.classList.toggle("invalid", errors.length > 0);
    status.textContent = errors.length ? `Needs attention: ${errors.slice(0, 3).join(" ")}` : `Ready to drift · ${this.level.width} × ${this.level.height} tiles · ${this.level.fireflies.length} fireflies`;
    if (document.activeElement !== this.jsonArea()) this.jsonArea().value = JSON.stringify(this.level, null, 2);
    if (save && !errors.length) {
      this.dirty = true;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.level)); } catch { /* Storage may be disabled; editing still works. */ }
    }
  }

  private loadDraft(): void {
    try {
      const source = localStorage.getItem(STORAGE_KEY);
      if (!source) return;
      const result = parseLevel(source);
      if (result.level) this.level = result.level;
    } catch { /* A denied or corrupt draft falls back to the included template. */ }
  }

  private applyJSON(source: string): void {
    const result = parseLevel(source);
    if (!result.level) {
      const status = this.root.querySelector<HTMLElement>("#editor-validation")!;
      status.classList.add("invalid");
      status.textContent = `Import not applied: ${result.errors.slice(0, 4).join(" ")}`;
      this.options.error("That JSON is not a valid Lantern Drift level. Your current draft is unchanged.");
      return;
    }
    this.level = result.level;
    this.selection = null;
    this.syncFields();
    this.resize();
    this.commit();
    this.options.error("Level imported and validated. Ready to play-test.");
  }

  private async importFile(event: Event): Promise<void> {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    if (!file) return;
    try { this.applyJSON(await file.text()); }
    catch (error) { this.options.error(`Could not read that file: ${error instanceof Error ? error.message : String(error)}`); }
    field.value = "";
  }

  private play(): void {
    const errors = validateLevel(this.level);
    if (errors.length) { this.options.error(`Fix the level before play-testing: ${errors[0]}`); return; }
    this.commit();
    const test = copy(this.level);
    test.id = "custom-workshop-playtest";
    this.options.play(test);
  }

  private exportJSON(): void {
    const errors = validateLevel(this.level);
    if (errors.length) { this.options.error(`Fix the level before exporting: ${errors[0]}`); return; }
    const blob = new Blob([JSON.stringify(this.level, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${this.level.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lantern-level"}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.options.error("JSON exported. Add it to public/levels to use it in a campaign.");
  }

  private draw(): void {
    const ctx = this.ctx, t = this.tile, level = this.level;
    ctx.clearRect(0, 0, level.width * t, level.height * t);
    const sky = ctx.createLinearGradient(0, 0, 0, level.height * t);
    sky.addColorStop(0, "#101a36"); sky.addColorStop(1, "#29354b");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, level.width * t, level.height * t);
    for (const zone of level.winds) {
      ctx.fillStyle = "rgba(139,217,221,.11)"; this.rect(zone);
      ctx.strokeStyle = this.selection?.id === zone.id ? "#f6f0df" : "rgba(139,217,221,.65)"; this.outline(zone);
      ctx.fillStyle = "#8bd9dd"; ctx.font = `${Math.max(9, t * 0.42)}px system-ui`;
      ctx.fillText(`${zone.force > 0 ? "→" : "←"} ${zone.force}`, (zone.x + 0.2) * t, (zone.y + 0.65) * t);
    }
    for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
      if (level.tiles[y][x] === "#") {
        ctx.fillStyle = "#182238"; ctx.fillRect(x * t, y * t, t + 0.5, t + 0.5);
        if (level.tiles[y - 1]?.[x] !== "#") { ctx.fillStyle = "#6f7890"; ctx.fillRect(x * t, y * t, t, Math.max(2, t * 0.08)); }
      }
      ctx.strokeStyle = "rgba(166,174,196,.12)"; ctx.lineWidth = 1;
      ctx.strokeRect(x * t + 0.5, y * t + 0.5, t, t);
    }
    for (const p of level.platforms) {
      ctx.fillStyle = "#69758c"; this.rect(p);
      ctx.strokeStyle = this.selection?.id === p.id ? "#ffc66d" : "#a3b2c7"; this.outline(p);
      ctx.fillStyle = "#8bd9dd"; ctx.font = `${Math.max(8, t * 0.34)}px system-ui`;
      ctx.fillText(`${p.axis === "horizontal" ? "↔" : "↕"} ${p.distance}`, p.x * t, (p.y - 0.15) * t);
    }
    for (const candle of level.candles) this.marker(candle.x, candle.y - 0.35, "#ffc66d", "♦");
    for (const fly of level.fireflies) this.marker(fly.x, fly.y, "#d8ed91", "•");
    for (const enemy of level.enemies) {
      this.marker(enemy.x + 0.4, enemy.y + 0.4, enemy.type === "moth" ? "#c4b5cc" : "#8bd9dd", enemy.type === "moth" ? "M" : "G");
      ctx.strokeStyle = this.selection?.id === enemy.id ? "#f6f0df" : "rgba(196,181,204,.4)";
      ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(enemy.minX * t, (enemy.y + 0.8) * t); ctx.lineTo(enemy.maxX * t, (enemy.y + 0.8) * t); ctx.stroke(); ctx.setLineDash([]);
    }
    this.marker(level.checkpoint.x, level.checkpoint.y + 0.4, "#ffc66d", "C");
    this.marker(level.spawn.x + 0.29, level.spawn.y + 0.43, "#f6f0df", "S");
    ctx.strokeStyle = "#ffc66d"; ctx.lineWidth = 2; this.outline(level.exit);
    this.marker(level.exit.x + level.exit.w / 2, level.exit.y + level.exit.h / 2, "#ffc66d", "E");
    if (this.dirty) { /* Draft persistence is reported in the inspector, not painted into exported art. */ }
  }

  private rect(rect: Rect): void { this.ctx.fillRect(rect.x * this.tile, rect.y * this.tile, rect.w * this.tile, Math.max(3, rect.h * this.tile)); }
  private outline(rect: Rect): void { this.ctx.lineWidth = 1.5; this.ctx.strokeRect(rect.x * this.tile + 1, rect.y * this.tile + 1, rect.w * this.tile - 2, Math.max(3, rect.h * this.tile - 2)); }
  private marker(x: number, y: number, color: string, text: string): void {
    const ctx = this.ctx, radius = Math.max(7, this.tile * 0.28);
    ctx.fillStyle = "rgba(9,13,31,.82)"; ctx.beginPath(); ctx.arc(x * this.tile, y * this.tile, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = color; ctx.font = `600 ${Math.max(9, this.tile * 0.42)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, x * this.tile, y * this.tile + 0.5); ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }
}
