const config = require('./config');
const { db } = require('./db');

const ABOUT_DEFAULT = `## The Centre's roots
Carmel Ayurveda Village and Research Centre was initiated in 1983. It grew out of the social commitment activities of Nirmalgram Welfare Centre, which was established under the Carmel Province of the CMI Congregation.

The initiative was inspired by the public and by the CMI Fathers of the Carmel Province in Muvattupuzha, Kerala.

## Nirmalgram Welfare Centre and the CMI Congregation
Nirmalgram Welfare Centre was established under the Carmel Province of the CMI Congregation. The Congregation is associated with Saint Kuriakose Elias Chavara, and the Centre's work grew from the social commitment that this tradition encourages.

## Our purpose
The Centre describes its purpose as practising and propagating Ayurveda. It offers classical Ayurvedic medicines, treatments and therapies to patients from India and abroad.

## A sanctuary for integrated living
Carmel Heritage describes itself as a sanctuary for integrated living and healthy living, rooted in the traditions and principles of Ayurveda.`;

const PRIVACY_DEFAULT = `## Who we are
This website is run by Carmel Ayurveda Village and Research Centre, Bhoothathankettu P.O., Kothamangalam, Kochi, Kerala 686681, India.

## What we collect
When you use an enquiry form we collect the details you enter: your name, your WhatsApp or mobile number, your email address (optional), requested dates, number of guests, accommodation or treatment preference, number of units and your message.

## How the enquiry works
The form prepares a WhatsApp message. When you press send in WhatsApp, the message is delivered to the Centre through WhatsApp, which has its own privacy policy. We also save a copy of the form details on our server so that staff can follow up, even if the WhatsApp message is not sent.

## Why we use it
We use your details only to answer your enquiry, confirm availability and rates, and manage any stay or treatment you arrange with the Centre.

## Guest records
We keep one guest record for each guest, linked by mobile number or email. It holds your name, contact details, your past and upcoming bookings and enquiries, and the number of guests in each stay, so that staff can look after returning guests. You can ask us to delete it.

## Who can see it
Authorised staff of the Centre. If email notifications are switched on, a copy is emailed to the Centre's property email address. We do not sell your details or use them for advertising.

## How long we keep it
We keep enquiry records for {{retention}} and then delete them, unless we need to keep them for a legal or accounting reason.

## Analytics
If analytics is switched on, it records aggregate counts such as page views and the number of WhatsApp button clicks. Names, phone numbers, dates and message contents are never sent to analytics.

## Your choices
You can ask us to show, correct or delete the details we hold about you. Contact us using the details on the Contact page.

## Bookings and payments
When you book online we collect your name, mobile number, email address, dates, number of guests and rooms, and any message you add. Payments are processed by Razorpay, which has its own privacy policy. Your card, UPI and bank details go directly to Razorpay; this website does not see or store them. We keep the payment reference, the amount and the payment status. Booking and payment records are kept for as long as the law requires for accounting and tax purposes.`;

const POLICY_DEFAULT = `## Booking online
On the Book page you choose your dates, rooms and guests and pay online through Razorpay. Prices are per room per night, and GST is added at the rate shown before you pay. Your rooms are held for 20 minutes while you complete the payment.

## Confirmation
After your payment the Centre checks your rooms and confirms your booking by phone, WhatsApp or email. Your booking is confirmed only when the Centre tells you so. If the Centre cannot provide the rooms you paid for, the amount you paid is refunded in full to the original payment method.

## Advance and balance
If the Book page shows an advance, you pay that amount online and the balance at the Centre.

## Enquiries
Sending the website enquiry form or a WhatsApp message is a request for information, not a booking.

## Cancellations, changes and refunds
To cancel or change a booking, contact the Centre with your booking reference. The Centre will tell you the cancellation and refund terms that apply. Approved refunds are made to the original payment method and usually reach your account within 5 to 7 working days, depending on your bank.

## Check-in and check-out
The Centre will tell you the check-in and check-out arrangements when it confirms your request.

## Contact
Questions about this policy can be sent to the Centre using the details on the Contact page.`;

// type: text | textarea | url | email | tel | digits | bool | image | select
// review: true => shown on the owner "needs approval" list
const defs = [
  // Brand & contact
  { key: 'site_name', group: 'Brand and contact', label: 'Brand name', type: 'text', def: 'Carmel Heritage', review: true, help: 'Shown in the header, page titles and WhatsApp messages. The full organisation name below is used for legal and address details.' },
  { key: 'org_name', group: 'Brand and contact', label: 'Full organisation name', type: 'text', def: 'Carmel Ayurveda Village and Research Centre' },
  { key: 'address_street', group: 'Brand and contact', label: 'Address: street / post office', type: 'text', def: 'Bhoothathankettu P.O.', review: true },
  { key: 'address_locality', group: 'Brand and contact', label: 'Address: town', type: 'text', def: 'Kothamangalam', review: true },
  { key: 'address_city', group: 'Brand and contact', label: 'Address: city shown in the supplied address', type: 'text', def: 'Kochi', review: true },
  { key: 'address_region', group: 'Brand and contact', label: 'Address: state', type: 'text', def: 'Kerala' },
  { key: 'address_postal', group: 'Brand and contact', label: 'Address: PIN code', type: 'text', def: '686681', review: true },
  { key: 'phone_1', group: 'Brand and contact', label: 'Phone 1', type: 'tel', def: '+91 99469 23523', review: true },
  { key: 'phone_2', group: 'Brand and contact', label: 'Phone 2', type: 'tel', def: '+91 85909 23525', review: true },
  { key: 'whatsapp_choice', group: 'Brand and contact', label: 'Booking WhatsApp number', type: 'select', def: 'phone_1', review: true,
    options: [['phone_1', 'Phone 1'], ['phone_2', 'Phone 2'], ['custom', 'Custom number (below)'], ['env', 'Environment value (WHATSAPP_NUMBER)']],
    help: 'Choose which number receives website enquiries. The Centre must confirm this number is on WhatsApp and monitored before launch.' },
  { key: 'whatsapp_custom', group: 'Brand and contact', label: 'Custom WhatsApp number', type: 'digits', def: '', help: 'International format, digits only, e.g. country code then number. Used when "Custom number" is selected.' },
  { key: 'contact_email', group: 'Brand and contact', label: 'Public contact email', type: 'email', def: '', review: true, help: 'Shown on the site only when filled in.' },
  { key: 'notify_email', group: 'Brand and contact', label: 'Enquiry notification email (private)', type: 'email', def: '', help: 'New enquiries are emailed here if SMTP is configured on the server.' },
  { key: 'facebook_url', group: 'Brand and contact', label: 'Facebook URL', type: 'url', def: '' },
  { key: 'instagram_url', group: 'Brand and contact', label: 'Instagram URL', type: 'url', def: '' },
  { key: 'youtube_url', group: 'Brand and contact', label: 'YouTube URL', type: 'url', def: '' },

  // Location
  { key: 'map_confirmed', group: 'Location', label: 'The map pin has been confirmed on site', type: 'bool', def: false, review: true, help: 'Directions link and map embed are shown only when this is ticked.' },
  { key: 'directions_url', group: 'Location', label: 'Directions link (Google Maps share link)', type: 'url', def: '' },
  { key: 'map_embed_url', group: 'Location', label: 'Map embed URL (src of the embed iframe)', type: 'url', def: '', help: 'Must start with https://www.google.com/maps/embed or https://www.openstreetmap.org/export/embed.' },

  // Stay details
  { key: 'check_in_time', group: 'Stay details', label: 'Check-in time', type: 'text', def: '', review: true, help: 'Hidden on the site while empty.' },
  { key: 'check_out_time', group: 'Stay details', label: 'Check-out time', type: 'text', def: '', review: true, help: 'Hidden on the site while empty.' },

  // Online booking
  { key: 'booking_enabled', group: 'Online booking and payments', label: 'Online booking with payment is open', type: 'bool', def: true, review: true,
    help: 'When unticked, the Book page sends guests to the WhatsApp enquiry instead. Room prices and guest limits are set under Accommodation.' },
  { key: 'gst_percent', group: 'Online booking and payments', label: 'GST on room tariff (%)', type: 'percent', def: '5', review: true,
    help: 'Added on top of the room price. 5% applies to rooms up to Rs 7,500 a night from 22 September 2025. Confirm with your accountant.' },
  { key: 'payment_mode', group: 'Online booking and payments', label: 'What the guest pays online', type: 'select', def: 'advance', review: true,
    options: [['advance', 'An advance (percentage below); the balance is paid at the Centre'], ['full', 'The full amount']] },
  { key: 'advance_percent', group: 'Online booking and payments', label: 'Advance to collect online (%)', type: 'percent', def: '30', review: true,
    help: 'Used only when "An advance" is selected. 100 collects the full amount.' },
  { key: 'booking_reply_hours', group: 'Online booking and payments', label: 'Hours within which the Centre confirms a paid booking', type: 'number', def: '24', review: true,
    help: 'Shown to guests after payment. 0 hides the promise.' },

  // Homepage
  { key: 'hero_eyebrow', group: 'Homepage', label: 'Hero small line above the headline', type: 'text', def: 'Bhoothathankettu · Kothamangalam · Kerala' },
  { key: 'hero_headline', group: 'Homepage', label: 'Hero headline', type: 'text', def: 'A heritage of Ayurveda, rooted in Kerala since 1983' },
  { key: 'hero_text', group: 'Homepage', label: 'Hero supporting text', type: 'textarea', def: 'Carmel Ayurveda Village and Research Centre is a sanctuary for integrated and healthy living, rooted in the traditions and principles of Ayurveda, at Bhoothathankettu near Kothamangalam.' },
  { key: 'hero_image', group: 'Homepage', label: 'Hero photograph', type: 'image', def: '', review: true, help: 'Use only a photograph the Centre owns or has rights to. If empty, a labelled illustration is shown.' },
  { key: 'hero_image_alt', group: 'Homepage', label: 'Hero photograph alt text', type: 'text', def: '', help: 'Describe what the photograph shows.' },
  { key: 'intro_image', group: 'Homepage', label: 'Introduction photograph', type: 'image', def: '', help: 'Shown beside the introduction. Portrait or square works best.' },
  { key: 'intro_image_alt', group: 'Homepage', label: 'Introduction photograph alt text', type: 'text', def: '' },
  { key: 'ayurveda_image', group: 'Homepage', label: 'Ayurveda section photograph', type: 'image', def: '', help: 'For example a treatment room or herbal preparation, once rights are confirmed.' },
  { key: 'ayurveda_image_alt', group: 'Homepage', label: 'Ayurveda section photograph alt text', type: 'text', def: '' },
  { key: 'intro_text', group: 'Homepage', label: 'Introduction text', type: 'textarea', def: 'Since 1983 the Centre has worked to practise and propagate Ayurveda. It offers classical Ayurvedic medicines, treatments and therapies to patients from India and abroad, and welcomes guests to stay at its cottages and standard rooms.' },
  { key: 'treatments_intro', group: 'Homepage', label: 'Treatments intro (home and treatments page)', type: 'textarea', def: 'The Centre describes its purpose as practising and propagating Ayurveda, and offers classical Ayurvedic medicines, treatments and therapies. Results vary from person to person and nothing here is a promise of a cure. Contact the Centre to ask whether a treatment is suitable for you.' },
  { key: 'og_image', group: 'Homepage', label: 'Social sharing image (1200x630 recommended)', type: 'image', def: '', help: 'Optional. Use an approved image.' },

  // Pages
  { key: 'about_body', group: 'Page content', label: 'About page text', type: 'textarea', def: ABOUT_DEFAULT, help: 'Lines starting with "## " become headings. Blank line = new paragraph. Lines starting with "- " make a list.' },
  { key: 'about_image', group: 'Page banners', label: 'About page banner photograph', type: 'image', def: '', help: 'Wide landscape photographs (about 2000 x 900 px) work best for banners.' },
  { key: 'about_image_alt', group: 'Page banners', label: 'About banner alt text', type: 'text', def: '' },
  { key: 'stay_image', group: 'Page banners', label: 'Stay page banner photograph', type: 'image', def: '' },
  { key: 'stay_image_alt', group: 'Page banners', label: 'Stay banner alt text', type: 'text', def: '' },
  { key: 'treatments_image', group: 'Page banners', label: 'Treatments page banner photograph', type: 'image', def: '' },
  { key: 'treatments_image_alt', group: 'Page banners', label: 'Treatments banner alt text', type: 'text', def: '' },
  { key: 'facilities_image', group: 'Page banners', label: 'Facilities page banner photograph', type: 'image', def: '' },
  { key: 'facilities_image_alt', group: 'Page banners', label: 'Facilities banner alt text', type: 'text', def: '' },
  { key: 'contact_image', group: 'Page banners', label: 'Contact page banner photograph', type: 'image', def: '' },
  { key: 'contact_image_alt', group: 'Page banners', label: 'Contact banner alt text', type: 'text', def: '' },
  { key: 'management_intro', group: 'Page content', label: 'Management page introduction', type: 'textarea', def: '', help: 'Hidden while empty.' },
  { key: 'privacy_body', group: 'Page content', label: 'Privacy Policy text', type: 'textarea', def: PRIVACY_DEFAULT, review: true, help: '{{retention}} is replaced by the retention setting.' },
  { key: 'policy_body', group: 'Page content', label: 'Booking and Cancellation Policy text', type: 'textarea', def: POLICY_DEFAULT, review: true, help: 'Add the Centre\'s real cancellation, deposit and check-in terms here once approved.' },

  // Operations
  { key: 'site_live', group: 'Launch and data', label: 'Site is live (allow search engines to index)', type: 'bool', def: false, help: 'Leave unticked until the pre-launch checklist is complete. While unticked every page is marked noindex and robots.txt blocks crawlers.' },
  { key: 'retention_days', group: 'Launch and data', label: 'Delete enquiries after (days)', type: 'number', def: '365', review: true, help: '0 keeps enquiries until you delete them manually.' }
];

const byKey = Object.fromEntries(defs.map(d => [d.key, d]));
const groups = [...new Set(defs.map(d => d.group))];

let cache = null;
let cacheAt = 0;

function defaults() {
  const o = {};
  for (const d of defs) o[d.key] = d.def;
  return o;
}

function coerce(d, raw) {
  if (d.type === 'bool') return raw === '1';
  return raw;
}

// Cached for 15 seconds per server instance, so a change in the admin shows on the site within that time.
async function getSettings() {
  if (cache && Date.now() - cacheAt < 15000) return cache;
  const s = defaults();
  try {
    for (const r of await db.all('SELECT key,value FROM settings')) {
      const d = byKey[r.key];
      if (d) s[r.key] = coerce(d, r.value);
    }
    cache = s;
    cacheAt = Date.now();
  } catch (e) {
    console.error('Settings unavailable, using defaults:', e.message);
    return s; // DB down: site and WhatsApp route still work from defaults
  }
  return s;
}

function invalidate() { cache = null; }

async function saveSettings(values) {
  const now = new Date().toISOString();
  await db.tx(async () => {
    for (const [k, v] of Object.entries(values)) {
      await db.run(`INSERT INTO settings(key,value,updated_at) VALUES (?,?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, k, String(v), now);
    }
  });
  invalidate();
}

const digits = v => String(v || '').replace(/\D/g, '');

function whatsappNumber(s) {
  let n = '';
  switch (s.whatsapp_choice) {
    case 'phone_2': n = digits(s.phone_2); break;
    case 'custom': n = digits(s.whatsapp_custom); break;
    case 'env': n = config.whatsappEnv; break;
    default: n = digits(s.phone_1);
  }
  return n || config.whatsappEnv || digits(s.phone_1);
}

module.exports = { defs, byKey, groups, getSettings, saveSettings, invalidate, whatsappNumber, digits };
