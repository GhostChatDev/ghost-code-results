# SlotWise

A single-studio booking app for independent studios, built with Next.js App Router, TypeScript, Tailwind CSS, Prisma and PostgreSQL. Booking times are stored as UTC instants and displayed in the studio's IANA time zone.

## Local setup

You need Node.js 22, npm, and a PostgreSQL database. The database user must be allowed to install the `btree_gist` extension and create tables and constraints.

1. Install dependencies: `npm install`.
2. Set `DATABASE_URL` in your environment (or in a local `.env` file, which must not be committed):

   ```text
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/slotwise?schema=public"
   ```

   Replace `USER`, `PASSWORD`, and the database name with your own local database credentials. URL-encode special characters in credentials.
3. Apply the checked-in migration: `npx prisma migrate deploy`.
4. Generate the Prisma client: `npx prisma generate`.
5. Start the app: `npm run dev`. Open the local URL printed by Next.js.

For production, set `DATABASE_URL` in your hosting environment, apply migrations with `npx prisma migrate deploy`, run `npm run build`, and serve with `npm start`. Use HTTPS: production session cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`. Back up the database and restrict database access.

## Roles and initial setup

Public signup always creates a customer; it never grants owner access. To bootstrap an owner, sign up normally, then have a trusted database administrator promote that account using a parameterized database client or Prisma Studio (`npx prisma studio`) and set its `role` to `OWNER`. Verify the email carefully before changing it. Do not expose Prisma Studio publicly. Sign out and back in, then open **Owner → Settings** to set the studio name, IANA time zone, currency, services, hours, breaks, and days off.

Customers can view, reschedule, or cancel only their own bookings. Owners can see all bookings and may modify or cancel them after the customer cutoff. Customers may change a booking until exactly two hours before its start. The database excludes overlapping active intervals per studio, including concurrent inserts; adjacent intervals are allowed.

## Tests

Use a separate, disposable PostgreSQL database, not a production database. Set `DATABASE_URL` to it, then run:

```sh
npx prisma migrate deploy
npx prisma generate
npm test
```

The tests exercise the database exclusion constraint with simultaneous inserts, timezone and daylight-saving availability, the two-hour rule, and customer authorization using mocked server dependencies. The authorization tests do not replace a full end-to-end security audit.

## Known limits

- One studio and one shared booking resource are supported; there are no staff calendars, payments, notifications, password resets, or email verification.
- Sign-in is rate-limited per normalized email, and booking per account; these limits do not provide IP-wide protection against distributed or many-account attacks. Add an edge rate limiter before public deployment.
- Slots start on a 15-minute grid; opening hours and breaks cannot cross midnight. Changes to hours, breaks or days off do not automatically move existing bookings.
- A web manifest and raster icons are provided, but installability varies by browser and device; there is no offline booking.
- Sessions last 14 days, with no self-service session management. Expired sessions and rate-limit rows are not automatically purged.
