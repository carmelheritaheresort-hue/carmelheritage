// Treatment packages, treatments and daily rates from the Carmel brochure, as supplied by the owner.
// Spellings, schedules and prices are kept exactly as supplied (see docs/UNCONFIRMED.md for points to confirm).
//
// This file is used ONCE, by database migration 2, to fill the "packages" and "treatments" tables.
// After that, change prices and schedules in Admin > Packages and Admin > Treatments, not here.

const CATEGORY = {
  single: { label: 'One Treatment Session Per Day', short: 'One session per day' },
  double: { label: 'Two Treatment Sessions Per Day', short: 'Two sessions per day' }
};

// schedule: one line per item, shown in the expandable schedule.
const packages = [
  // A. One treatment session per day
  { category: 'single', name: 'Kayapalanalam', duration: '1 hour', price: 2500, schedule: ['Abhyangam', 'Steam Bath', 'Eye Therapy'] },
  { category: 'single', name: 'Ayushmanbhava', duration: '1 hour', price: 3500, schedule: ['Abhyangam', 'Sirodhara', 'Face Pack', 'Eye Treatment'] },
  { category: 'single', name: 'Niramaya', duration: '1 hour', price: 3000, schedule: ['Abhyangam', 'Elakizhi', 'Eye Treatment'] },
  { category: 'single', name: '3 Days Package', duration: '3 days', price: 8500, featured: true,
    schedule: ['Day 1: Abhyangam + Steam', 'Day 2: Elakizhi + Sirodhara', 'Day 3: Njavarakizhi + Sirodhara + Face Pack'] },
  { category: 'single', name: '5 Days Package', duration: '5 days', price: 13500,
    schedule: ['Abhyangam + Steam – 2 days', 'Elakizhi + Sirodhara – 2 days', 'Njavarakizhi + Face Pack + Sirodhara – 1 day'] },
  { category: 'single', name: '7 Days Package', duration: '7 days', price: 18000, featured: true,
    schedule: ['Abhyanga + Head Massage + Steam – 2 days', 'Elakizhi + Sirodhara – 3 days', 'Njavarakizhi + Face Pack – 2 days'] },
  { category: 'single', name: '10 Days Package', duration: '10 days', price: 26000,
    schedule: ['Abhyanga + Head Massage + Steam – 2 days', 'Pizhichil + Eye Treatment – 3 days', 'Elakizhi + Sirodhara – 3 days', 'Njavarakizhi + Face Pack – 2 days'] },
  { category: 'single', name: '15 Days Package', duration: '15 days', price: 36000,
    schedule: ['Abhyanga + Steam – 3 days', 'Pizhichil + Eye Treatment – 3 days', 'Elakizhi + Sirodhara – 3 days', 'Podikizhi + Sirodhara – 3 days', 'Njavarakizhi + Face Pack – 2 days'] },
  { category: 'single', name: '21 Days Package', duration: '21 days', price: 65000,
    schedule: ['Udvrithanam + Steam – 3 days', 'Abhyanga + Head Massage + Steam – 3 days', 'Elakizhi + Sirodhara – 5 days', 'Podikizhi + Sirodhara – 3 days', 'Pizhichil + Eye Treatment – 3 days', 'Njavarakizhi + Face Pack – 4 days'] },

  // B. Two treatment sessions per day (Extended Ayurvedic Wellness Packages)
  { category: 'double', name: '1 Day Package', duration: '1 day', price: 5800,
    schedule: ['Abhyangam + Herbal Steam – 1 day', 'Shirodhara – 1 day', 'Herbal Facial – 1 day'] },
  { category: 'double', name: '3 Days Package', duration: '3 days', price: 14500,
    schedule: ['Abhyangam + Herbal Steam – 1 day', 'Shirodhara – 3 days', 'Elakizhi – 1 day', 'Njavarakizhi – 1 day', 'Herbal Facial – 1 day'] },
  { category: 'double', name: '5 Days Package', duration: '5 days', price: 23000,
    schedule: ['Abhyangam + Herbal Steam – 2 days', 'Shirodhara – 3 days', 'Elakizhi – 2 days', 'Njavarakizhi – 1 day', 'Thakradhara – 2 days', 'Herbal Facial – 1 day'] },
  { category: 'double', name: '7 Days Package', duration: '7 days', price: 28000,
    schedule: ['Abhyangam + Herbal Steam – 2 days', 'Shirodhara – 5 days', 'Elakizhi – 3 days', 'Njavarakizhi – 2 days', 'Thakradhara – 2 days', 'Herbal Facial – 2 days'] },
  { category: 'double', name: '10 Days Package', duration: '10 days', price: 49000,
    schedule: ['Abhyangam + Herbal Steam Bath – 2 days', 'Shirodhara – 6 days', 'Elakizhi – 3 days', 'Njavarakizhi – 2 days', 'Thakradhara – 4 days', 'Pizhichil + Eye Therapy – 3 days', 'Herbal Facial – 2 days'] },
  { category: 'double', name: '14 Days Package', duration: '14 days', price: 68000, featured: true,
    schedule: ['Abhyangam + Herbal Steam – 3 days', 'Shirodhara – 7 days', 'Elakizhi – 3 days', 'Podikizhi – 3 days', 'Njavarakizhi – 2 days', 'Thakradhara – 4 days', 'Pizhichil + Eye Therapy – 3 days', 'Thalapothichil – 3 days', 'Herbal Facial – 3 days'] },
  { category: 'double', name: '21 Days Package', duration: '21 days', price: 99000, featured: true,
    schedule: ['Abhyangam + Herbal Steam – 3 days', 'Udvarthanam + Herbal Steam – 3 days', 'Shirodhara – 7 days', 'Elakizhi – 5 days', 'Podikizhi – 3 days', 'Thakradhara – 7 days', 'Njavarakizhi – 4 days', 'Pizhichil – 3 days', 'Herbal Facial – 4 days'] }
];

// Plain descriptions of what each treatment involves. No benefits or outcomes are claimed.
// Marked for owner review in docs/UNCONFIRMED.md.
const treatments = [
  ['Abhyangam', 'A full-body massage with warm herbal oil, given with the traditional strokes of Kerala Ayurveda.'],
  ['Herbal Steam', 'A steam bath in which steam from boiled herbs is applied to the body, usually after an oil massage.'],
  ['Sirodhara', 'Warm herbal oil is poured in a slow, steady stream over the forehead while you lie at rest.'],
  ['Elakizhi', 'Cloth bundles filled with herbal leaves are warmed in oil and pressed over the body in rhythmic movements.'],
  ['Njavarakizhi', 'Cloth bundles of Njavara rice, cooked in milk and a herbal decoction, are applied warm over the body.'],
  ['Pizhichil', 'Warm herbal oil is poured over the body in a continuous flow while therapists massage gently.'],
  ['Podikizhi', 'Cloth bundles filled with herbal powders are warmed and pressed over the body.'],
  ['Thakradhara', 'Herbal buttermilk is poured in a slow, steady stream over the forehead.'],
  ['Udvarthanam', 'A massage with dry herbal powder, applied with firm upward strokes.'],
  ['Eye Therapy', 'Traditional Ayurvedic care for the eyes using herbal preparations, given by a therapist.'],
  ['Herbal Facial', 'A facial treatment using herbal face packs and natural preparations.'],
  ['Thalapothichil', 'A herbal paste is applied over the scalp and covered for a set time, then washed off.']
].map(([name, summary]) => ({ name, summary }));

// Daily rates shown in the "Stay & Experience" section. Editable later in Admin > Settings.
const rates = { cottage: 5500, deluxe: 3000, dietFood: 900 };

module.exports = { CATEGORY, packages, treatments, rates };
