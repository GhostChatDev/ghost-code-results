// Input: WASD/arrows + mouse on desktop, two virtual sticks on touch screens.
// Everything writes into one reused `input` object (no allocation per frame).

export const input = {
  moveX: 0, moveY: 0,          // -1..1 move direction
  aimX: 1, aimY: 0,            // unit aim direction (touch) or zero
  mouseX: 0, mouseY: 0,        // mouse in world units
  useMouse: true,
  firing: false,
  touchMode: false,
  pausePressed: false,         // one-shot, cleared by the game
  left: { id: -1, ox: 0, oy: 0, x: 0, y: 0 },   // stick state in screen px
  right: { id: -1, ox: 0, oy: 0, x: 0, y: 0 },
};

const keys = Object.create(null);
const STICK_R = 60;

function updateKeys() {
  if (input.left.id !== -1) return;
  let x = 0, y = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) y -= 1;
  if (keys.KeyS || keys.ArrowDown) y += 1;
  const l = Math.hypot(x, y);
  input.moveX = l ? x / l : 0;
  input.moveY = l ? y / l : 0;
}

export function stickVector(s, outX) {
  let dx = s.x - s.ox, dy = s.y - s.oy;
  const l = Math.hypot(dx, dy);
  // Past the rim the stick's origin follows the thumb; deflection stays full.
  if (l > STICK_R) { s.ox = s.x - (dx / l) * STICK_R; s.oy = s.y - (dy / l) * STICK_R; dx = s.x - s.ox; dy = s.y - s.oy; }
  const m = Math.min(1, l / STICK_R);
  if (outX === 'move') {
    const cl = Math.hypot(dx, dy); // length after clamping (<= STICK_R)
    input.moveX = l > 4 ? (dx / cl) * m : 0;
    input.moveY = l > 4 ? (dy / cl) * m : 0;
  } else if (l > 8) {
    input.aimX = dx / l; input.aimY = dy / l;
    input.firing = true;
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {(sx:number, sy:number, out:{x:number,y:number}) => void} toWorld screen→world
 * @param {() => boolean} isPlaying  only capture touches while playing
 */
export function initInput(canvas, toWorld, isPlaying) {
  const tmp = { x: 0, y: 0 };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') { input.pausePressed = true; return; }
    keys[e.code] = true;
    if (e.code === 'Space') { input.firing = true; e.preventDefault(); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
    updateKeys();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'Space' && !mouseDown) input.firing = false;
    updateKeys();
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    mouseDown = false; input.firing = false; updateKeys();
  });

  let mouseDown = false;
  canvas.addEventListener('mousemove', (e) => {
    toWorld(e.clientX, e.clientY, tmp);
    input.mouseX = tmp.x; input.mouseY = tmp.y; input.useMouse = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    toWorld(e.clientX, e.clientY, tmp);
    input.mouseX = tmp.x; input.mouseY = tmp.y;
    mouseDown = true; input.firing = true; input.useMouse = true; input.touchMode = false;
  });
  window.addEventListener('mouseup', () => { mouseDown = false; input.firing = !!keys.Space; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const opts = { passive: false };
  canvas.addEventListener('touchstart', (e) => {
    input.touchMode = true; input.useMouse = false;
    if (!isPlaying()) return;
    e.preventDefault();
    const half = window.innerWidth / 2;
    for (const t of e.changedTouches) {
      const s = t.clientX < half ? input.left : input.right;
      if (s.id !== -1) continue;
      s.id = t.identifier; s.ox = s.x = t.clientX; s.oy = s.y = t.clientY;
    }
  }, opts);
  canvas.addEventListener('touchmove', (e) => {
    if (!isPlaying()) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === input.left.id) { input.left.x = t.clientX; input.left.y = t.clientY; stickVector(input.left, 'move'); }
      if (t.identifier === input.right.id) { input.right.x = t.clientX; input.right.y = t.clientY; stickVector(input.right, 'aim'); }
    }
  }, opts);
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === input.left.id) { input.left.id = -1; input.moveX = 0; input.moveY = 0; }
      if (t.identifier === input.right.id) { input.right.id = -1; input.firing = false; }
    }
  };
  canvas.addEventListener('touchend', end, opts);
  canvas.addEventListener('touchcancel', end, opts);
}

export function resetInput() {
  input.left.id = -1; input.right.id = -1;
  input.moveX = 0; input.moveY = 0; input.firing = false; input.pausePressed = false;
  for (const k in keys) keys[k] = false;
}

export const STICK_RADIUS = STICK_R;
