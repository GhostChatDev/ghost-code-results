# Lantern Drift — design system

## Visual direction
A quiet, paper-cut night city. Near-black indigo roofs frame a small, luminous amber lantern. Warm light is the only strong colour; wind and fireflies use pale cyan and chartreuse. Typography is editorial rather than arcade-like. No image or font downloads.

## Tokens
- Background `#090d1f`, surface `#12182c`, raised surface `#1a2239`, border `#2c3651`
- Text `#f6f0df`, muted `#a6aec4`, accent/flame `#ffc66d`, accent hover `#ffdaa0`
- Wind `#8bd9dd`, firefly `#d8ed91`, success `#9bd6a5`, danger `#ff8f88`
- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Display stack: `Georgia, "Times New Roman", serif`
- Body 15–16px, labels 12px, headings 24/36/64px; timers use tabular numbers
- Spacing: 4, 8, 12, 16, 24, 32, 48px; radii 12 and 20px

## Components
Full-viewport procedural canvas; translucent HUD; flame meter; modal screens; level cards with locks and records; 44px touch controls; editor tool palette and scrollable grid; labelled toggles; toast messages.

## Motion and layout
The simulation is fixed at 120Hz and rendering targets 60fps. Device pixel ratio is capped for mobile performance. Reduced motion removes particles, camera easing and CSS animation. Desktop uses centred panels; phone layouts are single-column, with safe-area padding and no page-level horizontal scrolling.
