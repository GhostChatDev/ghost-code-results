# Hourglass Desk design system

A calm, practical scheduling desk: warm ivory canvas, dark ink, and a restrained evergreen accent. The app is a single-provider workspace; data is live in PostgreSQL, not simulated.

## Tokens
- Background `#f7f6f2`; surface `#ffffff`; soft surface `#f1f3ee`; border `#e2e6de`
- Text `#18251e`; muted `#59685f`; accent `#245b43`; success `#226647`; danger `#a23434`
- Font: Inter, system sans-serif. Body 15px; small 13px; headings 22px, 30px, 38px. Tabular numbers for times and dates.
- Spacing: 4, 8, 12, 16, 24, 32px. Radii: 8px and 14px.
- Components: brand bar, segmented navigation, cards, labelled inputs, select controls, primary/secondary buttons, status notices, date navigator, time-slot grid, appointment list, service and availability forms.
- Desktop: compact top bar and a two-column booking workspace. Mobile: stacked cards and wrapping navigation, no page-level horizontal scrolling.

## Time semantics
Working hours are wall-clock times in the provider's IANA zone. Slots are stored as UTC instants and presented in the selected client zone. On a fall-back fold, choose the earlier occurrence of each repeated provider wall-clock start. A spring-forward wall-clock time that does not exist cannot be booked; it is skipped rather than silently moved to a different time. Actual duration and buffer are measured in elapsed minutes.

## Deployment boundary
This is a single-provider installation with no authentication. Provider settings and calendar are not private, and anyone who can reach the app can modify them; protect the entire deployment with access control before using real client information. Booking cancellation uses a secret link.
