# Lantern Drift

**Lantern Drift** is an original 2D side-scrolling platformer built with plain HTML5 Canvas, TypeScript, and Vite. Guide a small paper lantern across a windy night city, ride crosswinds, keep your flame lit on rooftop candles, gather fireflies, and reach the exit beacon.

All artwork is rendered procedurally on the HTML5 Canvas, and all sound effects are synthesized in real time with the Web Audio API. The game is installable as an offline-capable Progressive Web App (PWA).

---

## Core Mechanics

- **Fixed-Step Physics (`120 Hz`)**: Sub-stepped swept Axis-Aligned Bounding Box (AABB) collision detection prevents tunneling through 1-tile floors or walls at any frame rate.
- **Floating & Flame Meter**: Hold **Jump** in mid-air to float gently on the night air. Floating consumes your flame; standing near a rooftop **candle** refills it rapidly. If your flame runs out (or you fall below the rooftops), you respawn at the last **checkpoint**.
- **Wind Zones & Moving Platforms**: Directional wind currents push your lantern horizontally, while moving rooftop platforms carry you across wide gaps.
- **Enemies**:
  - **Patrolling Moth (`moth`)**: Patrols back and forth between `minX` and `maxX` and drains flame on contact.
  - **Gust Spirit (`gust`)**: Emits strong horizontal wind blasts and drains flame if touched directly.
- **Persistent Progress**: Unlocked levels, personal-best completion times, collected firefly counts, and user settings (sound and reduced motion) are persisted in `localStorage`.

---

## Controls

### Desktop (Keyboard)
| Action | Keys |
| :--- | :--- |
| **Move Left / Right** | `ArrowLeft` / `ArrowRight` or `A` / `D` |
| **Jump** | `Space`, `ArrowUp`, or `W` |
| **Float (Glide)** | Hold `Space`, `ArrowUp`, or `W` while airborne |
| **Pause / Resume** | `Escape` or `P` |

### Mobile / Touch
- **Move Left / Right**: On-screen directional buttons in the bottom-left corner.
- **Jump & Float**: Tap **Float** in the bottom-right corner to jump; hold it in mid-air to float.
- **Pause**: Tap the pause button in the top-right HUD.

---

## Development & Testing

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run unit tests (Vitest)
npm test

# Type-check and build production bundle
npm run build
```

---

## Adding or Editing a Level

You can build levels visually in the in-game **Level Workshop** (accessible from the title screen) and click **Play-test draft**, **Export JSON**, or **Import JSON**. To edit the source directly, expand **Level JSON**, change it, and click **Apply & validate JSON**. A bad import reports an error and leaves the current draft unchanged.

To add a permanent campaign level:

1. Create `public/levels/06.json` using the schema below. Every object needs a unique string `id` within its level.

```json
{
  "version": 1,
  "id": "starlit-spire",
  "order": 6,
  "name": "Starlit Spire",
  "subtitle": "High above the clocktower gusts",
  "width": 36,
  "height": 12,
  "tiles": [
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "##########....########......########",
    "##########....########......########"
  ],
  "spawn": { "x": 2, "y": 9.14 },
  "checkpoint": { "x": 18, "y": 9.14 },
  "exit": { "x": 33, "y": 8, "w": 0.8, "h": 2 },
  "candles": [
    { "id": "candle-1", "x": 6, "y": 10 },
    { "id": "candle-2", "x": 20, "y": 10 }
  ],
  "fireflies": [
    { "id": "fly-1", "x": 11, "y": 8 },
    { "id": "fly-2", "x": 23, "y": 7 },
    { "id": "fly-3", "x": 31, "y": 5 }
  ],
  "winds": [
    { "id": "wind-1", "x": 10, "y": 4, "w": 4, "h": 6, "force": 7.5 }
  ],
  "platforms": [
    { "id": "platform-1", "x": 22, "y": 8, "w": 3, "h": 0.35, "axis": "horizontal", "distance": 4, "speed": 1.8, "phase": 0 }
  ],
  "enemies": [
    { "id": "moth-1", "type": "moth", "x": 16, "y": 8.5, "minX": 14, "maxX": 20 },
    { "id": "gust-1", "type": "gust", "x": 29, "y": 7.5, "minX": 28, "maxX": 34 }
  ]
}
```

2. Register the file in `LEVEL_PATHS` in `src/game/levels.ts` (for example, add `6` to the existing `[1, 2, 3, 4, 5]` array). Add its path to `LEVELS` in `public/sw.js` so it is available offline, and bump that worker's `CACHE` version. Run `npm test` to validate the campaign.

All coordinates and sizes are measured in tile units (`1 tile = 48 px`). `tiles` contains exactly `height` strings, each `width` characters long: `#` is solid and `.` is empty. Positions refer to an entity's top-left corner, except candle bases and firefly centres; keep them clear of solid tiles. The exit and moving platforms require `w` and `h`, and platforms also require `axis`, `distance`, `speed`, and `phase`.

`parseLevel` and `validateLevel` in `src/game/validation.ts` check dimensions, bounds, tile rows, entity IDs, and finite numeric properties. `npm test` validates all five shipped campaign files. Invalid editor imports show actionable errors instead of replacing the draft or crashing the game.
