# Details that need owner approval before launch

Everything below is either empty, hidden, or filled with cautious wording. None of it was invented.

## Brand name
- The site uses **Carmel Heritage** as the brand name. The organisation name stays "Carmel Ayurveda Village and Research Centre" in the address, footer, About story, Privacy Policy and structured data (`legalName`).
- The supplied logo files (`assets/brand/`) still read "Carmel Ayurveda Village", so only the leaf emblem is used on the site. A new logo with the Carmel Heritage wordmark is needed if a full logo is wanted.
- Use the same brand name on the Google Business Profile, WhatsApp Business profile and signage, so search engines match them.

## Contact and location
- Which of the two supplied numbers (+91 99469 23523, +91 85909 23525) receives booking WhatsApp messages. Default is Phone 1, to be confirmed.
- Whether both numbers are on WhatsApp and who answers them.
- Public contact email and the private notification email (both empty).
- Address wording: "Bhoothathankettu P.O., Kothamangalam, Kochi, Kerala 686681, India" as supplied. Confirm that "Kochi" belongs in the display address. Structured data uses Kothamangalam as the town, Kerala as the state and 686681 as the PIN.
- Map pin, directions link and map embed (hidden until confirmed). No coordinates are published.
- Social media links (empty).

## Accommodation
- Total quantities: 8 cottages, 7 standard rooms (supplied).
- Capacity, bed types, amenities, photographs, rates, seasonal notes (all empty and hidden).
- Whether rates may be published at all.
- Check-in and check-out times (empty and hidden).
- Meals, extra-person charges and other inclusions (not mentioned anywhere).

## Ayurveda packages (added from the brochure details supplied in the upgrade brief)
The brochure PDF itself was not received; all packages, prices and schedules were taken from the written brief and kept exactly as given. Edit them in Admin > Packages.
- **Room prices (resolved by the owner):** normal online bookings use ₹4,500 (cottage) and ₹1,500 (standard room) per night plus GST. The brochure rates (Cottage Room ₹5,500/day, Deluxe Room ₹3,000/day) are shown on the Ayurveda Packages page as the rates for guests on a treatment package. Confirm this reading.
- **Occupancy rules (from the owner):** cottage rate covers 2 adults; up to 4 guests including children; extra adult ₹1,000 and child aged 7 to 12 ₹500 a night (no extra bed); under 7 free. Standard room: up to 2 guests in total, children included and free. Points to confirm: guests aged 13+ are counted as adults; extra charges are per night; a standard room cannot take 2 adults plus a child (set "Most guests per room" to 3 in Admin > Accommodation if it can).
- **"Deluxe Room" vs "Standard Room".** The brochure says Deluxe Room; the website calls the 7 tiled rooms Standard Rooms. The Deluxe Room card uses the standard room photo. Confirm they are the same rooms.
- Whether brochure prices include GST, and whether package prices are per person or per package.
- **Schedules that do not add up** (kept as supplied):
  - One session per day, 15 Days Package: the schedule lists 14 days (3+3+3+3+2).
  - Two sessions per day: listed treatment-days do not equal 2 × the package length: 1 Day (3 vs 2), 3 Days (7 vs 6), 5 Days (11 vs 10), 7 Days (16 vs 14), 10 Days (22 vs 20), 14 Days (31 vs 28), 21 Days (39 vs 42).
- **Spellings kept as in each brochure section:** Udvrithanam (one-session 21 days) vs Udvarthanam (two-session 21 days and the treatment list); Sirodhara vs Shirodhara; Abhyanga vs Abhyangam; Eye Treatment vs Eye Therapy; Steam vs Herbal Steam vs Herbal Steam Bath; Face Pack vs Herbal Facial.
- Kayapalanalam, Ayushmanbhava and Niramaya are listed as "1 hour". Confirm this is the session length.
- **Treatment descriptions** (Admin > Treatments) describe only what each treatment involves. They were written for the site and need owner approval. No benefits or outcomes are claimed.
- **Treatment photos:** none supplied. Cards show the leaf emblem until photos are uploaded in Admin > Treatments.
- Featured package photos on the homepage reuse property photos (treatment room, verandah, driveway, the Centre in the mist). Upload package photos in Admin > Packages if preferred.
- The Ayurvedic Diet Food card uses the dining photo from the gallery.
- **Address spelling:** the brochure says "Boothathankettu"; the site uses "Bhoothathankettu" as supplied originally. Confirm the correct spelling (Admin > Settings).
- **Map:** the brief asks for a Google Map of the verified location. The map stays hidden until the pin is confirmed and entered in Admin > Settings > Location.

## Digital Brochure page (/digital-brochure, from the 5 brochure images supplied in November 2026)
The original images are shown unchanged. The page text copies their prices, times and inclusions. To change a brochure, replace the file in `brochures/` and run `node scripts/brochure-images.js`, then update `src/data/digital-brochure.js`.
- **Brand names on the brochures** differ from the website: "Carmel Ayurveda Village" (day out), "Carmel Heritage Resort, Thattekkad, Bhoothathankettu" (group stay) and "Carmel Ayurveda Heritage" (membership). The page text uses Carmel Heritage.
- **Spelling:** the brochures use "Thattekkad"; the page text uses "Thattekad" (the bird sanctuary's usual spelling). The group stay brochure says "Bhoothaankettu", "Heritage Suit Villa" and "Dence Forest"; the page text says Bhoothathankettu, Heritage Suite Villa and dense forest.
- **Two membership offers:** 1 year at ₹75,000 (introductory offer; ₹60,000 for the first 25 registrations) and 2 years at ₹1,25,000 (₹1,00,000 for the first 100 subscribers). The page shows them as separate brochures and asks visitors to check which offer is open. Remove a brochure when its offer closes or the registration limit is reached.
- The 1 year brochure says "12 visits per year"; the 2 year brochure says "12 visits per person annually". Both also say 24 visits per couple. Confirm they mean the same thing.
- "Doctor consultation and wellness guidance, subject to the programme terms": the programme terms are not published. The membership brochures also say the Centre is "managed and operated by CMI Fathers, under the supervision of experienced Ayurvedic doctors and qualified therapists". This appears only in the images, not in the page text.
- **Group stay timings overlap:** trekking 10.30 am to 12.30 pm, and boating 12.00 noon to 3.00 pm.
- Whether the per-head prices include GST, and what happens for groups under 40 or over 50.
- The Standard Day Out brochure does not give a time for the evening tea.
- **School Day-Out Programme** (6th brochure): ₹850 per student below 15 years, ₹1,100 per student above 15 years. Not stated: the price for students aged exactly 15, teacher charges, transport, and minimum group size (the brochure asks schools to confirm these). "Set amid 9.5 acres overlooking Bhoothathankettu Dam" is taken from the brochure.
- The school brochure image shows an email (gm@carmeltourismvillage.com) and a website (www.carmeltourismvillage.com). The owner asked not to add the email to the site; neither appears in the page text.
- **Address (owner confirmed):** "Ernakulam District" replaces "Kochi" in the site address (Admin > Settings > Brand and contact).

## Online booking and payments
- Prices supplied by the owner: cottage Rs 4,500 and standard room Rs 1,500 per unit per night, plus GST. Confirm whether this is per room regardless of guests, and whether rates change by season or for extra guests.
- GST is set to 5% (the rate for rooms up to Rs 7,500 a night from 22 September 2025). Confirm with the Centre's accountant, and check the Centre is GST-registered.
- Guest limits per unit are set to 3 adults and 2 children for both types. These are placeholders: set the real limits under Admin > Accommodation.
- What is paid online: set to a 30% advance, balance at the Centre. Change under Admin > Settings > Online booking and payments.
- Confirmation model: the guest pays, then the Centre confirms within 24 hours. If the rooms cannot be provided, the full amount is refunded. This promise appears on the Book page, the confirmation page, the guest email and the policy page.
- Cancellation and refund terms (days before arrival, amounts) are not set. The policy page says the Centre will tell the guest the terms. Razorpay needs a clear refund policy before it activates a live account.
- Razorpay account, live keys and webhook (not set; the site runs a development simulation until keys are added).
- Phone, walk-in and WhatsApp bookings must be entered under Admin > Bookings > Block rooms, or the website can sell the same room twice.

## Treatments and health content
- Treatment names, descriptions, durations, prices (none listed).
- Practitioner names and qualifications (none listed).
- The wording of the treatments introduction.
- Health-related FAQ answers (three unapproved placeholder questions exist on check-in times, meals and directions).

## Facilities, management, gallery
- Facilities and experiences (none listed).
- Management profiles and the introduction (none listed).
- Gallery images, with rights, captions and alt text.
- Hero photograph. The herbal compress balls and yoga photographs may be used only once image rights are confirmed.

## Testimonials
- Jiby Jose E (Delhi) and Ebin V Francis (Bangalore, India): permission and exact wording. Only the names were supplied, so both entries are empty and unapproved.

## Policies and data
- Booking and Cancellation Policy: deposits, cancellation and change terms. The default text promises none and says the Centre shares terms when confirming.
- Privacy Policy: review with a legal adviser, including how the Centre handles requests to see or delete data.
- Enquiry retention period (default 365 days).

## Brand story
- The About text paraphrases the supplied story. Confirm the wording, especially the 1983 date, the Muvattupuzha reference and the Saint Kuriakose Elias Chavara association.

## Search and sharing
- Social sharing image (optional).
- Whether a Google Business Profile exists, and that it uses the same name, address and phone details.
