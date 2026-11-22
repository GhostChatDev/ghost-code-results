# Lantern Keep

An original tower-defense game: defend a lantern-lit woodland sanctuary against the Hollow.

## Visual system
- Background #0b161c; surface #14262d; border #355059.
- Text #f3ead3; muted #b4c4bf; accent #ffc76a; success #90d6b0; danger #ff9c8b.
- Board ground #203931; alternate ground #244137; route #71634a; grid #395148.
- Towers: ember #ffc76a, mortar #ff9c8b, frost #91d9ed.
- One system sans-serif stack; 14px body, 12px labels, 18px section heads, 28px title, 40px overlay title.
- Tabular numeric figures. Spacing 4/8/12/16/24/32px. Radii 8/16px.
- Controls have at least 44px targets, visible focus, hover and pressed states.

## Layout and components
- Dark compact header: title, wave, gold, lives and best wave.
- Canvas board preserves a 16:10 ratio. Desktop: board left, 240px command rail right.
- Landscape phones: compact header and board left, scrollable command rail right.
- Portrait: board above controls; rotate hint recommends landscape without blocking play.
- Command rail: three tower selection buttons with costs; selected-tower upgrades and sell;
  wave launch, pause, speed and mute; contextual status explaining rejected placement.
- Canvas: softly textured woodland cells, stone ridges, dashed illuminated shortest path,
  unique tower silhouettes, enemy health bars, projectiles and glowing keep.
- Start/pause/win/defeat overlays with explicit action buttons.
- HUD and live status remain HTML for legibility and accessible announcements.

## Rules and states
- Static rock ridges form chokepoints but always retain a path.
- Gate at (0,4), keep at (15,4). A* uses four-way movement and Manhattan distance.
- Placement must preserve a path from the gate and every living enemy's reserved next cell.
- Towers have a base level plus two upgrades; selling returns floor(70% of total investment).
- Simulated waves are deterministic; no network services or account needed.
- A 1/60-second fixed update handles combat independently of rendering speed.
- Best wave is saved locally; saving failures are reported without breaking play.
- Sound is synthesized only after user input; persistent mute setting.
