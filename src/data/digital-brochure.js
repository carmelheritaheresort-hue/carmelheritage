// Digital Brochure page content, copied from the five brochure images supplied by the Centre
// (November 2026). Prices, times and inclusions are exactly as printed. Spellings are normalised
// only for place names (Thattekad, Bhoothathankettu) and obvious typos ("Suit" -> "Suite",
// "Dence" -> "dense"); the original images are shown unchanged. See docs/UNCONFIRMED.md.
// Images live in public/img/brochures/ (made by scripts/brochure-images.js).
const sizes = require('../../public/img/brochures/sizes.json');

const MENU = ['Chapathi, rice', 'Chicken curry, Chicken 65', '2 vegetable curries', 'Green salad', 'Fruit salad', 'Ice cream'];

const items = [
  {
    slug: 'standard-day-out-package', category: 'day-out',
    title: 'Standard Day Out Package', tagline: 'Nature · Adventure · Refreshment',
    prices: [{ label: 'Per head', amount: 900 }],
    facts: ['Minimum 40 people, up to 50'],
    highlights: [
      '2-hour forest trekking',
      '1 hour to relax at the Open Jungle Park',
      'Lunch',
      'Thattekad Bird Sanctuary sightseeing',
      'Kuttampuzha riverside forest visit',
      'Evening tea and snacks',
      'Fresh-up at the resort: 2 cottages provided'
    ],
    details: [
      { heading: 'The day', items: ['10.00 am: trekking for 2 hours inside the forest', 'After trekking: 1 hour to relax and enjoy the Open Jungle Park', '1.00 pm: lunch',
        '2.30 pm: sightseeing at Thattekad Bird Sanctuary and a Kuttampuzha riverside forest visit', 'Back to the resort for tea with snacks'] },
      { heading: 'Lunch menu', items: MENU }
    ],
    alt: 'Standard Day Out Package brochure from Carmel Ayurveda Village, Bhoothathankettu: 900 rupees per head for 40 to 50 people, with forest trekking, the Open Jungle Park, lunch, Thattekad Bird Sanctuary and a Kuttampuzha riverside visit.',
    enquiry: 'Standard Day Out Package'
  },
  {
    slug: 'premium-day-out-package', category: 'day-out',
    title: 'Premium Day Out Package', tagline: 'Nature · Adventure · Refreshment',
    prices: [{ label: 'Per head', amount: 1200 }],
    facts: ['Minimum 40 people, up to 50'],
    highlights: [
      '9.00 am breakfast',
      '2-hour forest trekking',
      '1 hour to relax at the Open Jungle Park',
      'Lunch with the menu below',
      'Thattekad Bird Sanctuary sightseeing',
      'Kuttampuzha riverside forest visit',
      'Evening tea and snacks',
      'Fresh-up at the resort: 3 cottage rooms'
    ],
    details: [
      { heading: 'The day', items: ['9.00 am: breakfast', '9.30 am: trekking for 2 hours inside the forest', 'After trekking: 1 hour to relax and enjoy the Open Jungle Park', '1.00 pm: lunch',
        '2.30 pm: sightseeing at Thattekad Bird Sanctuary and a Kuttampuzha riverside forest visit', 'Back to the resort for tea with snacks'] },
      { heading: 'Lunch menu', items: MENU }
    ],
    alt: 'Premium Day Out Package brochure from Carmel Ayurveda Village, Bhoothathankettu: 1,200 rupees per head for 40 to 50 people, with breakfast, forest trekking, the Open Jungle Park, lunch, Thattekad Bird Sanctuary sightseeing and 3 cottage rooms for fresh-up.',
    enquiry: 'Premium Day Out Package'
  },
  {
    slug: 'family-wellness-membership-1-year', category: 'membership',
    title: 'Family Wellness Membership: 1 Year', tagline: 'Introductory offer · For adults aged 50 and above',
    prices: [{ label: '1 year membership', amount: 75000 }, { label: 'First 25 registrations only', amount: 60000, offer: true }],
    facts: ['Membership for 2 adults, both aged 50+'],
    highlights: [
      '12 visits per year',
      '24 visits per couple in one year',
      'One wellness visit every month',
      'Ayurvedic massage benefits for both members',
      'Room accommodation benefits for both members',
      'Doctor consultation and wellness guidance, subject to the programme terms'
    ],
    details: [],
    alt: 'Family Wellness Membership Programme brochure from Carmel Ayurveda Heritage, Bhoothathankettu, for two adults aged 50 and above: introductory offer of a 1 year membership at 75,000 rupees, or 60,000 rupees for the first 25 registrations only.',
    enquiry: 'Family Wellness Membership Programme (1 year membership, introductory offer)'
  },
  {
    slug: 'family-wellness-membership-2-years', category: 'membership',
    title: 'Family Wellness Membership: 2 Years', tagline: 'Subscription · For adults aged 50 and above',
    prices: [{ label: 'Subscription for 2 years', amount: 125000 }, { label: 'Mega offer for the first 100 subscribers', amount: 100000, offer: true }],
    facts: ['Membership for 2 adults, both aged 50+'],
    highlights: [
      '12 visits per person annually',
      '24 visits per couple in one year',
      'One wellness visit every month',
      'Ayurvedic massage benefits for both members',
      'Room accommodation benefits for both members',
      'Doctor consultation and wellness guidance, subject to the programme terms'
    ],
    details: [],
    alt: 'Family Wellness Membership Programme brochure from Carmel Ayurveda Heritage, Bhoothathankettu, for two adults aged 50 and above: subscription of 1,25,000 rupees for 2 years, with a mega offer of 1,00,000 rupees for the first 100 subscribers.',
    enquiry: 'Family Wellness Membership Programme (2 year subscription)'
  },
  {
    slug: 'group-stay-package', category: 'group-stay',
    title: 'Group Stay Package', tagline: 'Nature · Heritage · Togetherness',
    prices: [{ label: 'Per head', amount: 2500 }],
    facts: ['For groups of 40 to 50 members', 'Heritage Suite Villa, 5 sharing basis'],
    highlights: [
      'Welcome drink on arrival',
      '2-hour forest trekking',
      'Boating to Thattekad and a wildlife visit, with lunch on the boat',
      'Evening entertainment and games, tea or coffee',
      'Campfire, DJ music and dinner',
      'Overnight stay at the resort',
      'Morning dam sight walk, breakfast and check-out'
    ],
    details: [
      { heading: 'Itinerary', items: [
        '10.00 am: welcome drink on arrival',
        '10.30 am to 12.30 pm: 2 hours of trekking inside the dense forest of the old Bhoothathankettu jungle',
        '12.00 noon to 3.00 pm: boating to Thattekad, wildlife visit, lunch on the boat',
        '5.00 pm: evening entertainment and games in the park, tea or coffee',
        '6.00 pm to 7.00 pm: break and fresh-up',
        '7.30 pm: campfire, DJ music and dinner',
        'Overnight stay at the resort',
        'Next morning, 6.30 am to 7.30 am: dam sight walk',
        '8.00 am: breakfast',
        '9.00 am: check-out'
      ] },
      { heading: 'Who can join', items: ['Medical students', 'Teachers', 'Doctors', 'Nature lovers', 'Banking staff', 'Residents associations', 'Family get-togethers', 'Clubs and associations'] }
    ],
    alt: 'Group Stay Package brochure from Carmel Heritage Resort, Thattekad, Bhoothathankettu: 2,500 rupees per head for 40 to 50 members in the Heritage Suite Villa on a 5 sharing basis, with trekking, boating to Thattekad, campfire, DJ music, dinner, overnight stay and a dam sight walk.',
    enquiry: 'Group Stay Package'
  }
].map(b => ({ ...b, image: `/img/brochures/${b.slug}`, width: sizes[b.slug].width, height: sizes[b.slug].height, bytes: sizes[b.slug].bytes }));

const categories = [
  { id: 'day-out', eyebrow: 'For groups of 40 to 50', title: 'Day Out <em>Packages</em>', plain: 'Day Out Packages',
    lead: 'A full day in nature at Bhoothathankettu: forest trekking, the Open Jungle Park, lunch, Thattekad Bird Sanctuary and the Kuttampuzha riverside, with tea and snacks to end the day.' },
  { id: 'membership', eyebrow: 'For adults aged 50 and above', title: 'Family Wellness <em>Membership</em>', plain: 'Family Wellness Membership',
    lead: 'Monthly wellness visits for a couple, with Ayurvedic massage and room accommodation benefits. These are two separate brochures with different terms and prices. Please ask the Centre which membership offer is open now.' },
  { id: 'group-stay', eyebrow: 'For groups of 40 to 50', title: 'Group <em>Stay</em>', plain: 'Group Stay',
    lead: 'An overnight group getaway with trekking, boating to Thattekad, a campfire and a morning walk to the dam.' }
];

module.exports = { items, categories };
