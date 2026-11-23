# Owner handover guide

For the Carmel Ayurveda Village team. No coding is needed for anything here.

## Signing in

Go to `/admin` on the website and sign in with the account the developer created. Change your password under **Account**. Passwords need at least 12 characters.

Roles: **admin** does everything and manages users. **editor** edits website content. **staff** works with enquiries only.

## Handling enquiries

1. A guest fills in the form. WhatsApp opens on their phone with the message ready. A copy of the details is also saved under **Enquiries**. If the guest never presses send in WhatsApp, you will see the enquiry here but not in WhatsApp, so it is worth contacting them.
2. Open the enquiry, contact the guest, and update the status: **new**, **contacted**, **confirmed**, **declined** or **cancelled**. Use **confirmed** only after you have checked availability and told the guest the rate.
3. Use internal notes for anything staff should know. Guests never see them.
4. Filter by status, type, accommodation, received date or check-in date. **Export these as CSV** downloads the filtered list.
5. Enquiries are deleted automatically after the number of days set in Settings (default 365; 0 keeps them until deleted by hand).

If email is set up on the server, the notification address in Settings receives a message for each new enquiry.

## Editing the website

- **Settings**: phone numbers, which number receives WhatsApp enquiries, email, social links, map link, check-in and check-out times, homepage wording, About text, privacy and booking policy text.
- **Accommodation**: the two categories (cottages 8, standard rooms 7). Fill in capacity, beds, amenities and rates only when confirmed. Empty fields stay hidden.
- **Treatments, Facilities, Gallery, FAQs, Testimonials, Management**: add items and tick **Approved** to publish. Untick to hide.
- Text boxes: a line starting with `## ` is a heading, a blank line starts a new paragraph, a line starting with `- ` is a bullet.

Rules for health content: do not describe cures, prevention, detox results or guaranteed outcomes. Do not list practitioner qualifications that have not been checked.

## Photos

Upload only photographs the Centre owns or has permission to use, including the herbal compress and yoga photographs, once rights are confirmed. Always write alt text that describes what the picture shows. Until a hero photograph is approved, the homepage shows a labelled illustration. Tick "This is an illustration" for any non-photographic image.

## Going live

1. Open **Pre-launch** and work through every item. The page lists the settings that still need confirmation.
2. When everything is verified, open **Settings**, tick **Site is live** and save. This lifts the search-engine block.
3. Submit `/sitemap.xml` in Google Search Console and claim the Google Business Profile with the same name, address and phone numbers as the site.

## Pre-launch verification (same list as the admin page)

- [ ] Booking WhatsApp number is correct and monitored.
- [ ] Both phone numbers and the email address are correct.
- [ ] Address is correct and the map pin is confirmed; directions link and map embed added.
- [ ] 8 cottages and 7 standard rooms are correct.
- [ ] Room capacities, features, rates and availability wording are approved.
- [ ] Treatment list, descriptions and practitioner details are approved.
- [ ] Facilities and experiences are confirmed.
- [ ] Check-in and check-out times and policies are approved.
- [ ] Testimonials: permission and exact wording are confirmed.
- [ ] Image rights and alt text are confirmed.
- [ ] Privacy policy and enquiry retention period are approved (legal review recommended).
- [ ] Search titles, descriptions and structured data have been checked.

## Adding the map

1. Open the Centre's location in Google Maps while standing at, or after checking with someone at, the property, and confirm the pin.
2. Use Share > Copy link for the directions link, and Share > Embed a map for the embed (copy only the `src` address from the iframe).
3. Paste both into **Settings > Location** and tick "The map pin has been confirmed".

## Analytics

Off by default. If the developer sets `PLAUSIBLE_DOMAIN`, the site records page views and counts of WhatsApp and call button clicks. No personal details are sent. No cookie banner is needed for this setup.

## Who to call

Keep the developer's contact and the hosting account details with the owner. Back up the `data` folder (database and uploaded images) regularly.
