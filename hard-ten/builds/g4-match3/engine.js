/* Tidepool Tiles: deterministic rules, independent of DOM and rendering. */
(function (root) {
  'use strict';
  const SIZE = 8, KINDS = 6;
  class TideEngine {
    constructor(seed = 1, board = null) {
      this.seed = seed >>> 0; this.nextId = 1;
      this.board = board ? board.map(t => t && ({ ...t, id: this.nextId++ })) : [];
      if (!board) this.generate();
    }
    random() {
      this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }
    tile(kind = Math.floor(this.random() * KINDS), special = null, dir = 'row') {
      return { kind, special, dir, id: this.nextId++ };
    }
    snapshot() { return this.board.map(t => t && ({ ...t })); }
    adjacent(a, b) {
      return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < 64 && b < 64 &&
        Math.abs(a % 8 - b % 8) + Math.abs(Math.floor(a / 8) - Math.floor(b / 8)) === 1;
    }
    swap(a, b) { [this.board[a], this.board[b]] = [this.board[b], this.board[a]]; }
    matches() {
      const runs = [];
      for (let axis = 0; axis < 2; axis++) for (let line = 0; line < 8; line++) {
        let run = [], kind = -1;
        const flush = () => { if (run.length >= 3) runs.push({ cells: run.slice(), dir: axis ? 'col' : 'row' }); };
        for (let p = 0; p <= 8; p++) {
          const index = axis ? p * 8 + line : line * 8 + p;
          const next = p < 8 && this.board[index] ? this.board[index].kind : -2;
          if (next !== kind || p === 8) { flush(); run = []; kind = next; }
          run.push(index);
        }
      }
      return runs;
    }
    generate() {
      do {
        this.board = [];
        for (let i = 0; i < 64; i++) {
          const choices = [];
          for (let k = 0; k < KINDS; k++) {
            if (i % 8 >= 2 && this.board[i - 1].kind === k && this.board[i - 2].kind === k) continue;
            if (i >= 16 && this.board[i - 8].kind === k && this.board[i - 16].kind === k) continue;
            choices.push(k);
          }
          this.board.push(this.tile(choices[Math.floor(this.random() * choices.length)]));
        }
      } while (!this.hasMove());
    }
    hasMove() {
      for (let a = 0; a < 64; a++) for (const b of [a + 1, a + 8]) {
        if (!this.adjacent(a, b)) continue;
        if (this.board[a]?.special || this.board[b]?.special) return true;
        this.swap(a, b); const found = this.matches().length > 0; this.swap(a, b);
        if (found) return true;
      }
      return false;
    }
    reshuffle() {
      const tiles = this.board.filter(Boolean);
      for (let attempt = 0; attempt < 150; attempt++) {
        this.board = tiles.slice();
        for (let i = 63; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1)); this.swap(i, j);
        }
        if (!this.matches().length && this.hasMove()) return;
      }
      this.generate();
    }
    turn(a, b) {
      if (!this.adjacent(a, b)) return { valid: false, frames: [], counts: Array(6).fill(0), score: 0 };
      this.swap(a, b);
      const frames = [{ type: 'swap', board: this.snapshot() }];
      const activated = [a, b].filter(i => this.board[i].special);
      if (!activated.length && !this.matches().length) {
        this.swap(a, b); frames.push({ type: 'rollback', board: this.snapshot() });
        return { valid: false, frames, counts: Array(6).fill(0), score: 0 };
      }
      const bombTargets = {};
      for (const i of activated) if (this.board[i].special === 'bomb') {
        bombTargets[i] = this.board[i === a ? b : a].special === 'bomb' ? -1 : this.board[i === a ? b : a].kind;
      }
      return { valid: true, ...this.resolve([b, a], activated, bombTargets, frames) };
    }
    resolve(preferred = [], initial = [], bombTargets = {}, frames = []) {
      const counts = Array(6).fill(0); let score = 0, chain = 0;
      while (true) {
        const runs = this.matches();
        if (!runs.length && !initial.length) break;
        chain++;
        const clear = new Set(initial), spawns = new Map();
        for (const run of runs) {
          run.cells.forEach(i => clear.add(i));
          if (run.cells.length < 4) continue;
          const at = preferred.find(i => run.cells.includes(i)) ?? run.cells[Math.floor(run.cells.length / 2)];
          const special = run.cells.length >= 5 ? 'bomb' : 'line';
          if (!spawns.has(at) || special === 'bomb') spawns.set(at, { special, dir: run.dir });
        }
        // A special hit by another special fires too, once, before replacements appear.
        const fired = new Set();
        for (const i of clear) {
          const t = this.board[i];
          if (!t?.special || fired.has(i)) continue;
          fired.add(i);
          if (t.special === 'line') {
            for (let n = 0; n < 8; n++) clear.add(t.dir === 'col' ? n * 8 + i % 8 : Math.floor(i / 8) * 8 + n);
          } else {
            const target = bombTargets[i] ?? t.kind;
            this.board.forEach((other, j) => { if (other && (target === -1 || other.kind === target)) clear.add(j); });
          }
        }
        for (const i of clear) { if (this.board[i]) { counts[this.board[i].kind]++; score += 60 * chain; } }
        const before = this.snapshot();
        for (const i of clear) this.board[i] = null;
        for (const [i, value] of spawns) this.board[i] = this.tile(before[i].kind, value.special, value.dir);
        frames.push({ type: 'clear', board: this.snapshot(), removed: [...clear], chain });
        for (let c = 0; c < 8; c++) {
          const column = [];
          for (let r = 7; r >= 0; r--) if (this.board[r * 8 + c]) column.push(this.board[r * 8 + c]);
          for (let r = 7; r >= 0; r--) this.board[r * 8 + c] = column[7 - r] || this.tile();
        }
        frames.push({ type: 'fall', board: this.snapshot(), chain });
        initial = []; preferred = []; bombTargets = {};
        if (chain >= 100) { this.generate(); frames.push({ type: 'shuffle', board: this.snapshot() }); break; }
      }
      if (!this.hasMove()) { this.reshuffle(); frames.push({ type: 'shuffle', board: this.snapshot() }); }
      return { frames, counts, score };
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { TideEngine, SIZE, KINDS };
  else root.TideEngine = TideEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
