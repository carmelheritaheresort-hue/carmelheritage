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

// Property photos used on featured package cards that have no photo of their own.
function fallbackImages(s) {
  return [['ayurveda_image', 'ayurveda_image_alt'], ['stay_image', 'stay_image_alt'], ['about_image', 'about_image_alt'], ['intro_image', 'intro_image_alt'], ['hero_image', 'hero_image_alt']]
    .filter(([k]) => s[k]).map(([k, a]) => ({ src: s[k], alt: s[a] || '' }));
}

get('/', async (req, res) => {
  const s = res.locals.s;
  const [types, faqs, treatments, gallery, facilities, testimonials, pkgs] = await Promise.all([
    content.accommodation(), content.faqs(), content.approved('treatments'), content.approved('gallery'),
    content.approved('facilities'), content.testimonials(), content.packages()
  ]);
  // Hero slideshow: the hero photo first, then every approved gallery photo (no illustrations, no repeats).
  const seen = new Set();
  const heroSlides = [{ src: s.hero_image, alt: s.hero_image_alt }, ...gallery.filter(g => !g.is_illustration).map(g => ({ src: g.image, alt: g.alt }))]
    .filter(x => x.src && !seen.has(x.src) && seen.add(x.src));
  const imgs = fallbackImages(s);
  const featured = pkgs.filter(p => p.featured).slice(0, 4)
    .map((p, i) => ({ pkg: p, media: p.photo ? { src: p.photo, alt: p.photo_alt } : (imgs[i % (imgs.length || 1)] || { src: '', alt: '' }) }));
  page(req, res, 'home', {
    title: `${s.site_name} | Ayurveda and Stay at Bhoothathankettu`,
    description: `${s.org_name}, Bhoothathankettu, Kothamangalam, Kerala. Explore 8 cottages, 7 standard rooms and Ayurveda treatments, and book your stay online.`,
    jsonld: [seo.businessLd(s, res.locals.address), seo.websiteLd(s), ...(faqs.length ? [seo.faqLd(faqs)] : [])]
  }, {
    types, faqs, treatments: treatments.slice(0, 4), allTreatments: treatments,
    facilities, gallery: gallery.slice(0, 6), testimonials, featured,
    heroSlides: s.hero_slideshow ? heroSlides : [],
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
    title: `Ayurveda Treatment in Kothamangalam | Our Ayurvedic Treatments | ${s.site_name}`,
    description: `Abhyangam, Sirodhara, Elakizhi, Njavarakizhi, Pizhichil and other classical Kerala Ayurvedic treatments at ${s.site_name}, Bhoothathankettu, Kothamangalam.`,
    crumbs: [{ name: 'Treatments', path: '/treatments' }]
  }, { treatments: await content.approved('treatments') });
});

get('/ayurveda-packages', async (req, res) => {
  const s = res.locals.s;
  const [pkgs, types, gallery] = await Promise.all([content.packages(), content.accommodation(), content.approved('gallery')]);
  const groups = { single: pkgs.filter(p => p.category === 'single'), double: pkgs.filter(p => p.category === 'double') };
  const cottage = types.find(t => t.kind === 'cottage') || {}, standard = types.find(t => t.kind === 'standard_room') || {};
  const perDay = k => content.inr(s[k]);
  const stayCards = [
    { title: 'Cottage Room', rate: perDay('rate_cottage'), unit: 'day', src: cottage.photo, alt: cottage.photo_alt, href: '/enquiry?stay=cottage', cta: 'Enquire' },
    { title: 'Deluxe Room', rate: perDay('rate_deluxe'), unit: 'day', src: standard.photo, alt: standard.photo_alt, href: '/enquiry?stay=standard', cta: 'Enquire' },
    { title: 'Ayurvedic Diet Food', rate: perDay('rate_diet_food'), unit: 'day', src: s.diet_food_image, alt: s.diet_food_image_alt, external: true,
      href: res.locals.waLink(`Hello ${s.site_name}, I\u2019d like to ask about Ayurvedic diet food during my stay.`), cta: 'Ask on WhatsApp' }
  ];
  const stayGallery = gallery.filter(g => /^(cottage|standard)/i.test(g.caption || '')).slice(0, 6);
  page(req, res, 'packages', {
    title: `Ayurveda Treatment Packages Kerala | Wellness Retreat Kothamangalam | ${s.site_name}`,
    description: `Kerala Ayurvedic wellness packages at ${s.site_name}, Kothamangalam: ${pkgs.length} treatment programmes from 1 hour to 21 days, with prices, schedules and WhatsApp booking enquiry.`,
    crumbs: [{ name: 'Ayurveda Packages', path: '/ayurveda-packages' }],
    jsonld: pkgs.length ? [seo.packagesLd(s, pkgs)] : []
  }, { groups, stayCards, stayGallery });
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
  const [types, treatments] = await Promise.all([content.accommodation(), content.approved('treatments')]);
  page(req, res, 'contact', {
    title: `Contact and Directions | Ayurveda Wellness Centre Kothamangalam | ${s.site_name}`,
    description: `Contact ${s.site_name}: ${res.locals.address}. Call, message on WhatsApp or send an enquiry about Ayurveda treatments, packages or your stay.`,
    crumbs: [{ name: 'Contact and Directions', path: '/contact' }],
    jsonld: [seo.businessLd(s, res.locals.address)]
  }, { treatments, withForm: true, fc: content.formContext(types) });
});

get('/enquiry', async (req, res) => {
  const s = res.locals.s;
  const [types, treatments, packages] = await Promise.all([content.accommodation(), content.approved('treatments'), content.packages()]);
  const mode = ['treatment', 'package'].includes(req.query.type) ? req.query.type : 'stay';
  const pref = ['cottage', 'standard', 'either'].includes(req.query.stay) ? req.query.stay : 'either';
  const formPackage = /^\d{1,9}$/.test(String(req.query.package || '')) ? Number(req.query.package) : '';
  const titles = { stay: 'Booking Enquiry', treatment: 'Treatment Enquiry', package: 'Package Booking Enquiry' };
  page(req, res, 'enquiry', {
    title: `${titles[mode]} | ${s.site_name}`,
    description: `Send a stay, treatment or Ayurveda package enquiry to ${s.site_name} on WhatsApp. The Centre confirms availability.`,
    noindex: true,
    crumbs: [{ name: titles[mode], path: '/enquiry' }]
  }, {
    mode, pref, prefTreatment: String(req.query.treatment || '').slice(0, 150), formPackage,
    treatments, packages, withForm: true, fc: content.formContext(types)
  });
});

get('/book', async (req, res) => {
  const s = res.locals.s;
  const [rooms, gallery] = await Promise.all([content.safe(() => booking.roomTypes(), {}), content.safe(() => content.approved('gallery'), [])]);
  const provider = payments.bookingMode();
  const open = !!s.booking_enabled && Object.keys(rooms).length > 0;
  // Photos for the room details window: the room's own photo, then gallery photos captioned "Cottage..." / "Standard...".
  const roomPhotos = {};
  for (const [kind, re] of [['cottage', /^cottage/i], ['standard_room', /^standard/i]]) {
    const r = rooms[kind];
    if (!r) continue;
    const list = r.photo ? [{ src: r.photo, alt: r.photo_alt || r.name }] : [];
    for (const g of gallery) if (re.test(g.caption || '') && g.image && !g.is_illustration && !list.some(x => x.src === g.image)) list.push({ src: g.image, alt: g.alt || g.caption });
    roomPhotos[kind] = list.slice(0, 8);
  }
  const q = req.query;
  const pick = (v, re) => (typeof v === 'string' && re.test(v) ? v : '');
  const pre = {
    check_in: pick(q.check_in, /^\d{4}-\d{2}-\d{2}$/),
    check_out: pick(q.check_out, /^\d{4}-\d{2}-\d{2}$/),
    adults: pick(q.adults, /^\d{1,2}$/) || '2',
    children_mid: pick(q.children_mid, /^\d{1,2}$/) || '0',
    children_young: pick(q.children_young, /^\d{1,2}$/) || '0',
    room: ['cottage', 'standard'].includes(q.room) ? q.room : ''
  };
  page(req, res, 'book', {
    title: `Book Your Stay | ${s.site_name}`,
    description: `Choose dates, rooms and guests at ${s.site_name}, Bhoothathankettu, and book your stay online.`,
    noindex: true,
    crumbs: [{ name: 'Book', path: '/book' }]
  }, {
    open, provider, rooms, pre, roomPhotos,
    requestHoldHours: booking.requestHoldHours(s),
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

const SITEMAP = ['/', '/about', '/stay', '/stay/cottages', '/stay/standard-rooms', '/treatments', '/ayurveda-packages', '/facilities', '/management', '/gallery', '/contact', '/privacy-policy', '/booking-cancellation-policy'];

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
