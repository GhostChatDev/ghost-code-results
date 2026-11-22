// Entry point: fixed-step loop on requestAnimationFrame, menus and buttons.
import { game, startGame, stress, setReducedMotion } from './game.js';
import { step } from './sim.js';
import { draw, resize, screenToWorld } from './render.js';
import { initInput, input, resetInput } from './input.js';
import { unlockAudio, toggleMute, isMuted } from './audio.js';

const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const overlay = $('overlay'), title = $('title'), info = $('info'), startBtn = $('startBtn');
const pauseBtn = $('pauseBtn'), muteBtn = $('muteBtn'), rmBox = $('reducedMotion');

resize(canvas);
window.addEventListener('resize', () => resize(canvas));
initInput(canvas, screenToWorld, () => game.state === 'playing');

function showOverlay(t, text, btn) {
  title.textContent = t; info.textContent = text; startBtn.textContent = btn;
  overlay.hidden = false;
}
function hideOverlay() { overlay.hidden = true; }

function updateMuteLabel() { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', isMuted() ? 'Unmute' : 'Mute'); }
updateMuteLabel();
rmBox.checked = game.reducedMotion;
rmBox.addEventListener('change', () => setReducedMotion(rmBox.checked));

function begin() {
  unlockAudio();
  if (game.state === 'paused') { game.state = 'playing'; hideOverlay(); return; }
  resetInput();
  startGame();
  hideOverlay();
}
startBtn.addEventListener('click', begin);

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused'; resetInput();
    showOverlay('Paused', `Wave ${game.wave} · Score ${game.score}`, 'Resume');
  } else if (game.state === 'paused') {
    begin();
  }
}
pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); togglePause(); });
muteBtn.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); toggleMute(); updateMuteLabel(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') togglePause(); });
window.addEventListener('keydown', (e) => {
  // Pause applies at once (not on the next frame), so two quick presses toggle twice.
  if (e.code === 'KeyP' || e.code === 'Escape') {
    input.pausePressed = false;
    if (!e.repeat) togglePause();
    return;
  }
  if ((e.code === 'Enter') && (game.state === 'menu' || game.state === 'over' || game.state === 'won')) begin();
});

showOverlay('Static Bloom',
  `Survive 20 waves. Desktop: WASD to move, mouse to aim, hold click to fire, P to pause. Phone: left thumb moves, right thumb aims and fires. High score: ${game.highScore}`,
  'Start');

const STEP = 1 / 120;
let acc = 0, last = performance.now(), frames = 0, lastState = game.state;

function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  if (input.pausePressed) { input.pausePressed = false; togglePause(); }
  while (acc >= STEP) { step(STEP); acc -= STEP; }
  if (game.state !== lastState) {
    if (game.state === 'over') showOverlay('Game Over', `Wave ${game.wave} · Score ${game.score}${game.newHigh ? ' · NEW HIGH SCORE!' : ` · High ${game.highScore}`}`, 'Restart');
    if (game.state === 'won') showOverlay('Static Bloom Cleared', `All 20 waves! Score ${game.score}${game.newHigh ? ' · NEW HIGH SCORE!' : ` · High ${game.highScore}`}`, 'Play again');
    pauseBtn.hidden = !(game.state === 'playing' || game.state === 'paused');
    lastState = game.state;
  }
  draw(g);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Hooks for the browser smoke test.
window.__bloom = {
  get frames() { return frames; },
  get state() { return game.state; },
  stress,
};
