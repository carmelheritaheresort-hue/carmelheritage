const config = require('./config');
const { getSettings, whatsappNumber, digits } = require('./settings');
const { esc, renderText, lines, fmtDate, jsonLd, isHttpUrl } = require('./util');
const { rupees } = require('../public/js/booking-calc.js');

// Facilities and Management sit under About so the main menu fits on one line on laptops.
const NAV = [
  { name: 'Home', path: '/' },
  { name: 'About', path: '/about', children: [{ name: 'About the Centre', path: '/about' }, { name: 'Facilities', path: '/facilities' }, { name: 'Management', path: '/management' }] },
  { name: 'Treatments', path: '/treatments' },
  { name: 'Ayurveda Packages', path: '/ayurveda-packages' },
  { name: 'Stay', path: '/stay', children: [{ name: 'Cottages', path: '/stay/cottages' }, { name: 'Standard Rooms', path: '/stay/standard-rooms' }, { name: 'Book Online', path: '/book' }] },
  { name: 'Gallery', path: '/gallery' },
  { name: 'Contact', path: '/contact' }
];

const EMBED_PREFIXES = ['https://www.google.com/maps/embed', 'https://www.openstreetmap.org/export/embed'];

module.exports = async function locals(req, res, next) {
  let s;
  try { s = await getSettings(); } catch (e) { return next(e); }
  const L = res.locals;
  L.s = s;
  L.siteUrl = config.siteUrl;
  L.analytics = config.analytics;
  L.waNumber = whatsappNumber(s);
  L.waLink = text => `https://wa.me/${L.waNumber}` + (text ? `?text=${encodeURIComponent(text)}` : '');
  L.tel = p => 'tel:+' + digits(p);
  L.phones = [s.phone_1, s.phone_2].filter(Boolean);
  L.address = [s.address_street, s.address_locality, s.address_city, [s.address_region, s.address_postal].filter(Boolean).join(' '), 'India'].filter(Boolean).join(', ');
  L.directionsUrl = s.map_confirmed && s.directions_url && isHttpUrl(s.directions_url) ? s.directions_url : '';
  const embed = s.map_confirmed && EMBED_PREFIXES.some(p => String(s.map_embed_url).startsWith(p)) ? s.map_embed_url : '';
  L.mapEmbed = embed;
  L.mapOrigin = embed ? new URL(embed).origin : '';
  L.nav = NAV;
  L.currentPath = req.path;
  L.esc = esc;
  L.renderText = renderText;
  L.lines = lines;
  L.fmtDate = fmtDate;
  L.rupees = rupees;
  L.jsonLd = jsonLd;
  L.img = (src, alt, o = {}) =>
    `<img src="${esc(src)}" alt="${esc(alt || '')}"${o.cls ? ` class="${esc(o.cls)}"` : ''}${o.w ? ` width="${o.w}" height="${o.h}"` : ''} loading="${o.eager ? 'eager' : 'lazy'}" decoding="async"${o.eager ? ' fetchpriority="high"' : ''}>`;
  L.withForm = false;
  next();
};
