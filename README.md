# Carmel Heritage website

Public website, online booking with payment, guest profiles and staff admin area for **Carmel Heritage** (run by Carmel Ayurveda Village and Research Centre, Bhoothathankettu P.O., Kothamangalam, Kochi, Kerala 686681).

The site is server-rendered with Node.js, Express and EJS. Data is stored in **Supabase** (PostgreSQL), uploaded photos in **Supabase Storage**, and the site is hosted on **Vercel**. It has no client-side framework, so pages load fast. JavaScript is needed only for the booking page and the WhatsApp enquiry form.

## What it does

- Public pages: Home, About, Stay (Cottages, Standard Rooms), Treatments, Facilities, Management, Gallery, Contact and Directions, Book, Booking Enquiry, Privacy Policy, Booking and Cancellation Policy.
- **Online booking** (`/book`): dates, rooms, adults and children, live availability, price with GST, and payment through Razorpay. The Centre confirms each paid booking.
- **Enquiries**: stay and treatment enquiries open a pre-written WhatsApp message. A copy is saved for staff. Enquiries are never described as bookings.
- **Guest profiles**: one record per guest with their bookings, enquiries and party sizes.
- Admin area (`/admin`) with roles: **admin** (everything), **editor** (website content), **staff** (bookings, guests and enquiries).
- Every content item has an **Approved** switch. Unapproved items and empty fields never appear publicly.
- SEO: unique titles and descriptions, canonical URLs, Open Graph, `sitemap.xml`, `robots.txt`, breadcrumbs, JSON-LD.
- The site starts in **not live** mode: every page is `noindex` and `robots.txt` blocks crawlers until the owner ticks "Site is live" in Settings.

## Project layout

```
server.js                 App setup and security headers. Exports the app for Vercel; listens on a port when run locally
vercel.json               Daily scheduled job (Vercel Cron)
src/config.js             Environment configuration
src/db.js                 PostgreSQL connection, query helpers, migrations, seed data
src/settings.js           Editable site settings
src/resources.js          Field definitions for the admin content editor
src/booking.js            Availability, prices, booking records
src/payments.js           Razorpay orders and signature checks
src/guests.js             Guest profiles
src/uploads.js            Image uploads to Supabase Storage
src/routes/public.js      Public pages, sitemap, robots
src/routes/api.js         Enquiries, availability, bookings, payment webhook, daily housekeeping
src/routes/admin.js       Admin area
src/auth.js               Sessions, roles, CSRF
src/mail.js               Optional emails
public/                   CSS, browser JS, fonts, images (served by Vercel's CDN)
views/                    EJS templates (public pages, partials, admin)
scripts/                  migrate, create-admin, import-from-sqlite (scripts/legacy: old SQLite-only tools)
docs/                     Owner handover guide and list of unconfirmed details
```

## Setup

Requirements: Node.js 22.13 or newer, a Supabase project and (for hosting) a Vercel account.

1. In Supabase, open **Connect > Connection string > Transaction pooler** and copy the URI (port 6543). Copy the **secret** API key from **Project Settings > API Keys**.
2. Fill in `.env` (copy `.env.example`): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
3. Run:

```powershell
npm install
npm run migrate                  # creates the tables in Supabase
$env:ADMIN_PASSWORD = "choose-a-long-password"
npm run create-admin -- owner@example.com "Owner Name" admin
npm run dev                      # http://localhost:3000, using the Supabase database
```

On Windows, if PowerShell says "running scripts is disabled", use `npm.cmd` instead of `npm`.

### Moving data from the old local version

The first version stored everything in `data/carmel.db` and `data/uploads/`. To copy it to Supabase once:

```powershell
npm run import-sqlite            # shows what would be copied, changes nothing
npm run import-sqlite -- --run   # copies rows and uploads the photos to Supabase Storage
```

It refuses to overwrite data already in Supabase unless you add `--replace`. The local files are only read.

## Database

- Tables live in Supabase's `public` schema. Row Level Security is switched on for every table with no policies, so Supabase's public Data API cannot read them. The app connects directly with the database password, which is not affected.
- Schema changes are migrations in `src/db.js`. Add new ones at the end; never edit one that has shipped. `npm run migrate` applies them, and the Vercel build runs it automatically (`npm run build`).
- Backups: Supabase takes daily backups on paid plans. On the free plan, export regularly (Supabase dashboard > Database > Backups, or `pg_dump`).

## Deploying to Vercel

1. In Vercel, **Add New > Project** and import the GitHub repo. Framework preset: **Other**. No build settings need changing.
2. In **Settings > Environment Variables** add: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SITE_URL` (for example `https://carmelheritage.vercel.app` or your domain), `CRON_SECRET` (a long random string), plus Razorpay and SMTP values when you have them.
3. Deploy. Each push to `main` deploys again.
4. For a custom domain, add it under **Settings > Domains** and update `SITE_URL`.
5. Point the Razorpay webhook at `https://YOUR-DOMAIN/api/payments/razorpay/webhook`.

Notes for Vercel:
- Files in `public/` are served by Vercel's CDN. Uploaded photos are in Supabase Storage, because Vercel has no permanent disk.
- Uploads are limited to 4 MB per image (Vercel's request limit is 4.5 MB).
- The development "simulate payment" button never works on Vercel. Online booking opens there once Razorpay keys are set.
- Unpaid booking holds expire whenever availability is checked. Old enquiries and sessions are cleaned up daily by the cron job.

## Configuration

All settings that change often live in **Admin > Settings**. Server values come from environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres connection string (transaction pooler) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET` | Photo storage |
| `SITE_URL` | Public base URL for canonical links, sitemap, emails and social tags |
| `CRON_SECRET` | Protects the daily housekeeping job |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Online payments |
| `SMTP_*`, `MAIL_FROM`, `NOTIFY_EMAIL` | Optional emails |
| `WHATSAPP_NUMBER` | Optional fallback WhatsApp number, digits only |
| `PLAUSIBLE_DOMAIN`, `PLAUSIBLE_SRC` | Optional aggregate analytics |

## Online booking and payments

- Prices and guest limits are set per room type under **Admin > Accommodation**. GST, full or advance payment, advance % and the confirmation time are under **Admin > Settings > Online booking and payments**.
- Flow: the booking is saved as *Awaiting payment* and the rooms are held for 20 minutes. After payment it becomes *Paid, awaiting confirmation*. Staff then set *Confirmed*, or refund in the Razorpay Dashboard and set *Refunded*.
- Availability is checked inside a database lock, so two guests paying at the same moment cannot take the same last room.
- Payment is verified on the server (checkout signature) and through the webhook (events `order.paid`, `payment.failed`). Prices are always recalculated on the server.
- Availability counts paid and confirmed bookings plus **Admin > Bookings > Block rooms**. Enter phone, walk-in and WhatsApp bookings there.

## Ayurveda packages

- `/ayurveda-packages`: 9 one-session-per-day and 7 two-sessions-per-day packages with duration, price, an expandable schedule, **Book now** and **WhatsApp**; a **Stay & Experience** section with daily rates for Cottage Room, Deluxe Room and Ayurvedic Diet Food; contact buttons.
- Packages live in the `packages` table and are edited in **Admin > Packages** (name, category, duration, price, schedule lines, featured, photo). "Featured" packages appear on the homepage. The original brochure data is in `src/data/brochure.js`, used once by migration 2.
- The Stay & Experience rates and the diet food photo are in **Admin > Settings > Ayurveda packages page**.
- **Book now** opens `/enquiry?type=package&package=<id>` with the package, duration and price filled in. Sending opens WhatsApp with the agreed message template and saves a copy under **Admin > Enquiries** (type "package"). The server takes the package name and price from the database, never from the browser.
- `/treatments` shows the 12 treatments (Admin > Treatments, with optional photos).

## Guest profiles

- **Admin > Guests** lists every guest with mobile, email, bookings, nights, largest party, booking value, last and next stay, and enquiries. Filters: returning (2+ bookings), upcoming stay, enquiries only. Export as CSV.
- Profiles are created or updated automatically on every booking and enquiry, matched by mobile number first, then email. Staff edits are never overwritten.
- Each profile shows the full history, usual room type, party sizes, staff notes and possible duplicates (with a merge button).
- ID documents are not stored; ID is checked in person at check-in.

## Security summary

- Passwords hashed with bcrypt (cost 12). Sessions are random tokens stored hashed in the database, in `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookies, expiring after 8 hours.
- CSRF token on every admin form. Role checks on every admin route.
- Rate limits on login, enquiries, availability and bookings, plus honeypot fields. On Vercel the limits apply per server instance.
- Strict Content Security Policy. Razorpay's sources are allowed only on the Book page.
- The Supabase secret key and database password are used only on the server.
- All SQL is parameterised. All output is HTML-escaped. CSV export neutralises spreadsheet formulas.
- Card, UPI and bank details go directly to Razorpay and are never seen or stored by this site.

## Known limitations

- Online availability does not sync with other channels (OTAs, phone). Use room blocks.
- Refunds are made in the Razorpay Dashboard, not from the admin.
- Images are not resized unless the optional `sharp` package installs. Resize large photos before uploading.
- No automated tests were added, as requested.
