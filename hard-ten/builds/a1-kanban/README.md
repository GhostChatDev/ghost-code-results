# Corkline

A shared demo kanban board built with Next.js and PostgreSQL. The demo is public to anyone who can access the app: do not put private information on it. There are no user accounts or per-team permissions.

## Run locally

Use Node.js 22 and a PostgreSQL database. From the repository root:

```sh
npm install
export DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/corkline'
npm run migrate
npm run seed
npm run dev
```

Replace the connection string with your own database credentials; do not commit them. Open the local URL printed by Next.js. Migration also creates the demo board if it does not already exist; the seed command is safe to run again and never replaces existing work.

Drag the handles with a mouse or touch, or use the keyboard. Open a card to edit it. Undo and redo buttons and Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z apply to board changes outside text fields.

Once a board has loaded, changes made offline are stored on that browser and retried on reconnect. Operation IDs make retries idempotent on the server. A first visit requires a network connection; this app does not cache its assets for a cold offline launch. Local storage may be cleared by the browser or user.

## Tests

Run `npm test` from the repository root. The PostgreSQL integration test runs when `DATABASE_URL` is set and migrations have been applied; otherwise it is reported as skipped. CI runs it against a real PostgreSQL service. The remaining tests cover ordering, undo/redo, and the offline queue.
