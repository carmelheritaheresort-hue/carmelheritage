const express = require('express');
const config = require('../config');
const seo = require('../seo');
const content = require('../content');
const { renderText, todayIST, wrap } = require('../util');
const booking = require('../booking');
const payments = require('../payments');

const router = express.Router();

const CRUMB_HOME = { name: 'Home', path: '/' };

function page(req, res, view, meta, data = {}) {
  const crumbs = meta.crumbs || [];
  const breadcrumbs = crumbs.length ? [CRUMB_HOME, ...crumbs] : [];
  const jsonld = [...(meta.jsonld || [])];
  if (breadcrumbs.length) jsonld.push(seo.breadcrumbLd(breadcrumbs));
  res.render(view, {
    seo: {
      title: meta.title,
      description: meta.description,
      path: meta.path === undefined ? req.path.replace(/\/+$/, '') || '/' : meta.path,
      noindex: !!meta.noindex,
      image: meta.image,
      breadcrumbs,
      jsonld
    },
    ...data
  });
}

const get = (path, fn) => router.get(path, wrap(fn));

get('/', async (req, res) => {
  const s = res.locals.s;
  const [types, faqs, treatments, gallery, facilities, testimonials] = await Promise.all([
    content.accommodation(), content.faqs(), content.approved('treatments'), content.approved('gallery'),
    content.approved('facilities'), content.testimonials()
  ]);
  page(req, res, 'home', {
    title: `${s.site_name} | Ayurveda and Stay at Bhoothathankettu`,
    description: `${s.org_name}, Bhoothathankettu, Kothamangalam, Kerala. Explore 8 cottages, 7 standard rooms and Ayurveda treatments, and book your stay online.`,
    jsonld: [seo.businessLd(s, res.locals.address), seo.websiteLd(s), ...(faqs.length ? [seo.faqLd(faqs)] : [])]
  }, {
    types, faqs, treatments: treatments.slice(0, 4), allTreatments: treatments,
    facilities, gallery: gallery.slice(0, 6), testimonials,
    fromPrice: Math.min(...types.map(t => t.price_per_night || Infinity)),
    fc: content.formContext(types)
  });
});

get('/about', async (req, res) => {
  const s = res.locals.s;
  page(req, res, 'about', {
    title: `About ${s.site_name} | A Sanctuary for Integrated Living`,
    description: `The story of ${s.org_name}: initiated in 1983, rooted in Ayurveda, and growing from Nirmalgram Welfare Centre and the CMI Carmel Province.`,
    crumbs: [{ name: 'About', path: '/about' }]
  }, { testimonials: await content.testimonials() });
});

get('/stay', async (req, res) => {
  const s = res.locals.s;
  page(req, res, 'stay', {
    title: `Stay: Cottages and Standard Rooms | ${s.site_name}`,
    description: `Stay at ${s.site_name}, Bhoothathankettu: 8 cottages and 7 standard rooms. Check availability for your dates and book online.`,
    crumbs: [{ name: 'Stay', path: '/stay' }]
  }, { types: await content.accommodation() });
});

function stayDetail(slug, label) {
  return async (req, res, next) => {
    const types = await content.accommodation();
    const type = types.find(t => t.slug === slug);
    if (!type) return next();
    const s = res.locals.s;
    page(req, res, 'stay-detail', {
      title: `${label} at ${s.site_name} | Bhoothathankettu, Kothamangalam`,
      description: `${type.total_units} ${label.toLowerCase()} at ${s.site_name}, Bhoothathankettu. Check availability for your dates and book online.`,
      crumbs: [{ name: 'Stay', path: '/stay' }, { name: label, path: '/stay/' + slug }]
    }, { type, others: types.filter(t => t.slug !== slug), withForm: false });
  };
}
get('/stay/cottages', stayDetail('cottages', 'Cottages'));
get('/stay/standard-rooms', stayDetail('standard-rooms', 'Standard Rooms'));

get('/treatments', async (req, res) => {
  const s = res.locals.s;
  page(req, res, 'treatments', {
    title: `Ayurveda Treatments | ${s.site_name}`,
    description: `Classical Ayurvedic medicines, treatments and therapies at ${s.site_name}, Bhoothathankettu. Contact the Centre to ask what is suitable for you.`,
    crumbs: [{ name: 'Treatments', path: '/treatments' }]
  }, { treatments: await content.approved('treatments') });
});

get('/facilities', async (req, res) => {
  const s = res.locals.s;
  page(req, res, 'facilities', {
    title: `Facilities and Experiences | ${s.site_name}`,
    description: `Facilities and experiences at ${s.site_name}, Bhoothathankettu, Kothamangalam. Contact the Centre to confirm what is available for your dates.`,
    crumbs: [{ name: 'Facilities', path: '/facilities' }]
  }, { facilities: await content.approved('facilities') });
});

get('/management', async (req, res) => {
  const s = res.locals.s;
  page(req, res, 'management', {
    title: `Management | ${s.site_name}`,
    description: `The people who manage ${s.org_name}, Bhoothathankettu, Kothamangalam, Kerala.`,
    crumbs: [{ name: 'Management', path: '/management' }]
  }, { people: await content.approved('management') });
});

get('/gallery', async (req, res) => {
  const s = res.locals.s;
  page(req, res, 'gallery', {
    title: `Gallery | ${s.site_name}`,
    description: `Photographs of ${s.site_name} at Bhoothathankettu, Kothamangalam, Kerala.`,
    crumbs: [{ name: 'Gallery', path: '/gallery' }]
  }, { gallery: await content.approved('gallery') });
});

get('/contact', async (req, res) => {
  const s = res.locals.s;
  page(req, res, 'contact', {
    title: `Contact and Directions | ${s.site_name}`,
    description: `Contact ${s.site_name}: ${res.locals.address}. Call or message on WhatsApp to enquire about a stay or treatment.`,
    crumbs: [{ name: 'Contact and Directions', path: '/contact' }],
    jsonld: [seo.businessLd(s, res.locals.address)]
  });
});

get('/enquiry', async (req, res) => {
  const s = res.locals.s;
  const [types, treatments] = await Promise.all([content.accommodation(), content.approved('treatments')]);
  const mode = req.query.type === 'treatment' ? 'treatment' : 'stay';
  const pref = ['cottage', 'standard', 'either'].includes(req.query.stay) ? req.query.stay : 'either';
  page(req, res, 'enquiry', {
    title: `Booking Enquiry | ${s.site_name}`,
    description: `Send a stay or treatment enquiry to ${s.site_name} on WhatsApp. The Centre confirms availability and rates.`,
    noindex: true,
    crumbs: [{ name: 'Booking Enquiry', path: '/enquiry' }]
  }, {
    mode, pref, prefTreatment: String(req.query.treatment || '').slice(0, 150),
    treatments, withForm: true, fc: content.formContext(types)
  });
});

get('/book', async (req, res) => {
  const s = res.locals.s;
  const rooms = await content.safe(() => booking.roomTypes(), {});
  const provider = payments.provider();
  const open = !!s.booking_enabled && !!provider && Object.keys(rooms).length > 0;
  const q = req.query;
  const pick = (v, re) => (typeof v === 'string' && re.test(v) ? v : '');
  const pre = {
    check_in: pick(q.check_in, /^\d{4}-\d{2}-\d{2}$/),
    check_out: pick(q.check_out, /^\d{4}-\d{2}-\d{2}$/),
    adults: pick(q.adults, /^\d{1,2}$/) || '2',
    children: pick(q.children, /^\d{1,2}$/) || '0',
    room: ['cottage', 'standard'].includes(q.room) ? q.room : ''
  };
  page(req, res, 'book', {
    title: `Book Your Stay | ${s.site_name}`,
    description: `Choose dates, rooms and guests at ${s.site_name}, Bhoothathankettu, and pay securely online.`,
    noindex: true,
    crumbs: [{ name: 'Book', path: '/book' }]
  }, {
    open, provider, rooms, pre,
    pricing: booking.pricing(s),
    today: todayIST(),
    testMode: provider === 'dev' || (provider === 'razorpay' && payments.isTestKey()),
    replyHours: Number(s.booking_reply_hours) || 0,
    holdMinutes: booking.HOLD_MINUTES
  });
});

get('/book/confirmation/:ref', async (req, res, next) => {
  const b = await content.safe(() => booking.byRef(req.params.ref), null);
  if (!b || !booking.tokenOk(b, req.query.t)) return next();
  const s = res.locals.s;
  res.set('Cache-Control', 'no-store');
  page(req, res, 'booking-confirmation', {
    title: `Booking ${b.ref} | ${s.site_name}`, description: 'Your booking details.', noindex: true, path: '/book/confirmation'
  }, { b: booking.publicView(b), replyHours: Number(s.booking_reply_hours) || 0, mailOn: !!config.smtp.host });
});

// Fallback if JavaScript is unavailable: nothing is stored; point the guest to phone/WhatsApp.
router.post('/enquiry', (req, res) => {
  const s = res.locals.s;
  res.status(400).render('error', {
    seo: { title: `Enquiry needs JavaScript | ${s.site_name}`, description: 'Enquiry form needs JavaScript.', path: '/enquiry', noindex: true, breadcrumbs: [], jsonld: [] },
    code: 400, heading: 'We could not send that enquiry', text: 'The enquiry form needs JavaScript. Please call the Centre or message it on WhatsApp instead.', withForm: false
  });
});

function policy(path, key, title, descFn, crumb) {
  router.get(path, (req, res) => {
    const s = res.locals.s;
    const desc = descFn(s.site_name);
    const days = Number(s.retention_days) || 0;
    const retention = days ? `${days} days from the date of the enquiry` : 'as long as needed to handle your enquiry';
    const body = renderText(String(s[key] || '').replace(/\{\{retention\}\}/g, retention));
    page(req, res, 'policy', {
      title: `${title} | ${s.site_name}`, description: desc, crumbs: [{ name: crumb, path }]
    }, { heading: title, body });
  });
}
policy('/privacy-policy', 'privacy_body', 'Privacy Policy', n => `How ${n} collects, uses and keeps the details you send in an enquiry.`, 'Privacy Policy');
policy('/booking-cancellation-policy', 'policy_body', 'Booking and Cancellation Policy', n => `How online bookings, confirmations and cancellations work at ${n}.`, 'Booking and Cancellation Policy');

const SITEMAP = ['/', '/about', '/stay', '/stay/cottages', '/stay/standard-rooms', '/treatments', '/facilities', '/management', '/gallery', '/contact', '/privacy-policy', '/booking-cancellation-policy'];

router.get('/sitemap.xml', (req, res) => {
  if (!res.locals.s.site_live) return res.status(404).type('text/plain').send('Not found');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    SITEMAP.map(p => `  <url><loc>${config.siteUrl}${p === '/' ? '/' : p}</loc></url>`).join('\n') + '\n</urlset>\n';
  res.type('application/xml').send(xml);
});

router.get('/robots.txt', (req, res) => {
  const live = res.locals.s.site_live;
  res.type('text/plain').send(live
    ? `User-agent: *\nDisallow: /admin\nDisallow: /api\nDisallow: /enquiry\nDisallow: /book\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n');
});

module.exports = router;
