# Carmel Heritage website

Public website, WhatsApp enquiry flow and staff admin area for **Carmel Heritage** (run by Carmel Ayurveda Village and Research Centre, Bhoothathankettu P.O., Kothamangalam, Kochi, Kerala 686681).

The site is server-rendered with Node.js, Express and EJS, and stores data in SQLite. It has no client-side framework, so pages load fast and work without JavaScript, except the enquiry form, which needs JavaScript to open WhatsApp.

## What it does

- 11 public pages: Home, About, Stay (Cottages, Standard Rooms), Treatments, Facilities, Management, Gallery, Contact and Directions, Booking Enquiry, Privacy Policy, Booking and Cancellation Policy.
- Stay and treatment enquiries open a pre-written WhatsApp message (`wa.me`). The same details are saved for staff, but the WhatsApp message still works if the database or the save request fails.
- Enquiries are called enquiries everywhere. The site never claims availability, a rate or a confirmation.
- Admin area (`/admin`) with roles: **admin** (everything), **editor** (website content), **staff** (enquiries). Staff can set status (new, contacted, confirmed, declined, cancelled), add internal notes, search and filter, and export CSV.
- Every content item has an **Approved** switch. Unapproved items and empty fields never appear publicly.
- Inventory is stored as 8 cottages and 7 standard rooms. These are total units, not live availability.
- SEO: unique titles and descriptions, canonical URLs, Open Graph, `sitemap.xml`, `robots.txt`, breadcrumbs, JSON-LD (LodgingBusiness and HealthAndBeautyBusiness, WebSite, BreadcrumbList, FAQPage for visible FAQs).
- The site starts in **not live** mode: every page is `noindex` and `robots.txt` blocks crawlers until the owner ticks "Site is live" in Settings.

## Project layout

```
server.js                 App setup, security headers, error handling, daily housekeeping
src/config.js             Environment configuration
src/db.js                 SQLite connection, migrations, seed data
src/settings.js           Editable site settings (definitions, defaults, WhatsApp number choice)
src/resources.js          Field definitions for the admin content editor
src/routes/public.js      Public pages, sitemap, robots
src/routes/api.js         POST /api/enquiries (validated, rate limited, spam traps)
src/routes/admin.js       Admin area
src/auth.js               Sessions, roles, CSRF
src/mail.js               Optional email notification
src/seo.js                JSON-LD builders
src/uploads.js            Image upload checks (and optional resize with sharp)
public/js/validation.js   Validation and WhatsApp message builder shared by browser and server
public/js/enquiry.js      Enquiry form behaviour
views/                    EJS templates (public pages, partials, admin)
scripts/                  migrate.js, create-admin.js
docs/                     Owner handover guide and list of unconfirmed details
```

## Local development

Requirements: Node.js 22.13 or newer. The database uses Node's built-in `node:sqlite`, so nothing has to be compiled.

```powershell
npm install
Copy-Item .env.example .env      # then edit .env
npm run migrate                  # creates the database and seed data
$env:ADMIN_PASSWORD = "choose-a-long-password"
npm run create-admin -- owner@example.com "Owner Name" admin
npm run dev                      # http://localhost:3000
```

`npm run create-admin` also works without `ADMIN_PASSWORD`; it will prompt for the password (visible while typing). Passwords need at least 12 characters.

On Windows, if PowerShell says "running scripts is disabled", run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `npm.cmd` instead of `npm`.

## Database and migrations

- The database is a single SQLite file (`DATABASE_PATH`, default `./data/carmel.db`). Schema lives in `src/db.js` as an ordered list of migrations.
- `npm run migrate` applies any migrations not yet applied. The server also runs migrations at startup.
- To change the schema, add a new migration object at the end of the list. Never edit one that has shipped.
- Back up by copying the `data/` folder (database and uploads) while the app is stopped, or use `sqlite3 carmel.db ".backup backup.db"`.
- To use PostgreSQL instead, replace `src/db.js` and the SQL in `src/routes/*.js`. The SQL is plain and parameterised, and the schema maps directly.

## Configuration

All settings that change often live in **Admin > Settings**. Server-level values come from environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Public base URL for canonical links, sitemap and social tags |
| `TRUST_PROXY` | Set `1` behind a proxy so rate limiting sees real IPs and cookies are secure |
| `DATABASE_PATH`, `UPLOAD_DIR` | Locations of the database and uploaded images (use persistent storage) |
| `WHATSAPP_NUMBER` | Optional fallback booking number, digits only |
| `SMTP_*`, `MAIL_FROM`, `NOTIFY_EMAIL` | Optional email notification for new enquiries |
| `PLAUSIBLE_DOMAIN`, `PLAUSIBLE_SRC` | Optional aggregate analytics |

The booking WhatsApp number is chosen in Settings (Phone 1, Phone 2, a custom number, or the environment value). The phone numbers are stored once, as editable setting defaults, and used everywhere through that setting.

## Deployment

The app needs a Node.js host with a **persistent disk** (SQLite and uploads are files). A small VPS, Render, Railway or Fly.io volume all work. It will not work on serverless platforms with read-only or temporary storage.

1. Provision Node.js 22.13+, and a persistent folder, for example `/var/lib/carmel`.
2. Set environment variables: `NODE_ENV=production`, `PORT`, `SITE_URL=https://your-domain`, `TRUST_PROXY=1`, `DATABASE_PATH=/var/lib/carmel/carmel.db`, `UPLOAD_DIR=/var/lib/carmel/uploads`, plus optional SMTP and analytics values.
3. Run `npm ci --omit=dev`, then `npm run migrate`, then create the first admin (`ADMIN_PASSWORD=... npm run create-admin -- email "Name" admin`).
4. Start with `npm start` under a process manager (systemd, PM2) or the platform's start command.
5. Put HTTPS in front (Nginx, Caddy or the platform's TLS). Session cookies are marked `Secure` in production, so HTTPS is required for admin sign-in.
6. Submit `https://your-domain/sitemap.xml` to Google Search Console only after the site is marked live.
7. Schedule backups of the data folder.

## Security summary

- Passwords hashed with bcrypt (cost 12). Sessions are random tokens stored hashed in the database, in `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookies, expiring after 8 hours.
- CSRF token on every admin form. Role checks on every admin route.
- Login limited to 10 attempts per 15 minutes per IP. Public enquiry API limited to 10 per hour per IP, with a hidden honeypot field and a minimum-time check. Server-side validation repeats the browser checks.
- Strict Content Security Policy (no inline scripts or styles), plus the other Helmet headers. Uploads are limited to JPEG, PNG, WebP and AVIF up to 5 MB, checked by file signature, and stored under random names.
- All SQL is parameterised. All output is HTML-escaped. CSV export neutralises spreadsheet formulas.
- Errors shown to users are generic. Details go to the server log only.
- No payment or card data is collected or stored.
- Analytics events carry only an event name. Names, phone numbers, dates and message text are never sent.

## Online booking and payments

- `/book`: guests choose dates, the number of cottages and standard rooms, and adults and children. The page shows free rooms for every night of the stay, the price, GST, the total and the amount to pay now, then opens Razorpay Checkout.
- Prices and guest limits are set per type under **Admin > Accommodation**. GST, full or advance payment, advance % and the confirmation time are under **Admin > Settings > Online booking and payments**.
- Flow: the booking is saved as *Awaiting payment* and the rooms are held for 20 minutes. After payment it becomes *Paid, awaiting confirmation*. Staff then set *Confirmed*, or refund in the Razorpay Dashboard and set *Refunded*. Unpaid holds expire on their own.
- Payment is verified on the server (checkout signature) and through the webhook `POST /api/payments/razorpay/webhook` (events `order.paid`, `payment.failed`), so a payment is recorded even if the guest closes the browser. Prices are always recalculated on the server.
- Availability counts paid and confirmed bookings plus **Admin > Bookings > Block rooms**. Enter phone, walk-in and WhatsApp bookings there.
- Setup: add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` to `.env` and restart. Without keys, a development server shows a "simulate payment" button (`DEV_PAYMENTS=1`). In production without keys the Book page falls back to the enquiry form.
- Emails (guest receipt and Centre notice) are sent when SMTP is configured.

## Guest profiles

- **Admin > Guests** lists every guest with mobile, email, number of bookings, nights, largest party, booking value, last and next stay, and enquiries. Filters: returning (2+ bookings), upcoming stay, enquiries only. Export as CSV.
- A profile is created or updated automatically on every online booking and website enquiry, matched by mobile number first, then email. Staff edits are never overwritten; only empty fields are filled.
- Each profile page shows the full booking and enquiry history, usual room type, party sizes, staff notes and possible duplicates (with a merge button). Booking and enquiry pages link to the profile and flag returning guests.
- Staff can add phone or walk-in guests by hand. ID documents are not stored; ID is checked in person at check-in.

## Known limitations

- Online availability does not sync with other channels (OTAs, phone). Use room blocks.
- Refunds are made in the Razorpay Dashboard, not from the admin.
- Images are not resized unless the optional `sharp` package installs (then uploads are converted to WebP, maximum 1600 px wide). Otherwise resize images before uploading.
- Rate limiting is in memory per process; run one instance, or add a shared store if you scale out.
- No automated tests were added, as requested.
