# Tallyroom design system

Tallyroom is a calm, dense neighbourhood-shop register. Warm paper, ink and a single green accent distinguish it from a generic admin dashboard. All product, sales and report figures come from PostgreSQL; the included demo migration is explicitly labelled in the interface.

## Colour tokens

- `--background: #f5f4ef` — warm page background
- `--surface: #fffefb` — cards and the register ticket
- `--surface-subtle: #eeeee7` — grouped controls and table headers
- `--border: #deded4` — cards, inputs and separators
- `--text: #20241f` — primary ink
- `--muted: #6b7068` — secondary labels (used at 14px or larger on light surfaces)
- `--accent: #245c46` — primary actions and active navigation
- `--accent-hover: #194433`
- `--accent-soft: #e1eee6`
- `--success: #28734e`
- `--danger: #a43e36`
- `--danger-soft: #f8e9e5`
- `--warning: #8b5b18`
- `--warning-soft: #f6ecd7`
- `--focus: #a66a16`

## Type

One stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Body 15px; small labels 13–14px; page title 28px/700; section title 18px/650; receipt and currency figures use `font-variant-numeric: tabular-nums`. Display totals are 30px/700.

## Space and shape

Spacing scale: 4, 8, 12, 16, 24, 32px. Card padding 20–24px; control height 44px; grid gaps 16–24px. Radius is 10px for cards and 7px for controls. Shadows are reserved for overlays; borders define ordinary surfaces.

## Layout and components

Desktop shell: fixed-width 224px dark-ink sidebar, 64px top bar, and a fluid content column capped at 1500px. Register: product search/results on the left (minmax 0, 1fr) and a 390px sale ticket on the right. Tables sit in cards with sticky headers and their own horizontal overflow when needed. Below 900px the sidebar becomes a top bar with a menu drawer and the register stacks; below 600px cards lose outer framing where that improves density. Nothing depends on hover.

Components: app sidebar, mobile menu, top bar, page heading, metric card, search field, product result grid, quantity stepper, sale ticket, discount dialog, confirmation/result dialog, badge, empty/loading/error panel, data table, stock movement form, refund selector, daily report chart and printable receipt.

## Interaction and accessibility

Every action has hover, active, disabled and `:focus-visible` states; transitions are 150ms. Icon-only buttons have accessible names. Inputs have visible labels. Errors are announced with `role="alert"`; success messages use `role="status"`. Touch targets are at least 44px. The receipt print stylesheet hides the application and prints only the receipt at 80mm-friendly width. Reduced-motion preferences remove transitions.

## Screens

1. **Register** — searchable inventory, barcode form, quantity controls, fixed-amount discount, live integer-cent totals, cash/card sale completion and printable receipt.
2. **Products** — product creation/editing for SKU, name, category, price, tax and low-stock threshold; current stock is read-only and every change opens a movement form with a reason.
3. **Stock** — low-stock summary, full ledger and receive/adjust actions.
4. **Sales** — sale history, line detail, whole/partial refunds and links to receipts.
5. **Reports** — date picker, gross/net sales, discounts, tax and refunds; top products and a sales-by-hour chart.
6. **Receipt** — immutable line snapshots, discount/tax/refund totals and browser printing.
