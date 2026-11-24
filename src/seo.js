const config = require('./config');

function abs(p) { return /^https?:/.test(p) ? p : config.siteUrl + p; }

// Only verified, supplied details are used. No coordinates, ratings, prices or hours are emitted.
function businessLd(s, address, extra = {}) {
  const sameAs = [s.facebook_url, s.instagram_url, s.youtube_url].filter(Boolean);
  const ld = {
    '@context': 'https://schema.org',
    '@type': ['LodgingBusiness', 'HealthAndBeautyBusiness'],
    '@id': config.siteUrl + '/#business',
    name: s.site_name,
    legalName: s.org_name,
    url: config.siteUrl + '/',
    telephone: s.phone_1,
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address_street,
      addressLocality: s.address_locality,
      addressRegion: s.address_region,
      postalCode: s.address_postal,
      addressCountry: 'IN'
    },
    foundingDate: '1983',
    description: 'Ayurveda centre with cottages and standard rooms at Bhoothathankettu, Kothamangalam, Kerala. Rooted in the traditions and principles of Ayurveda.',
    ...extra
  };
  if (s.contact_email) ld.email = s.contact_email;
  if (sameAs.length) ld.sameAs = sameAs;
  if (s.og_image) ld.image = abs(s.og_image);
  if (s.map_confirmed && s.directions_url) ld.hasMap = s.directions_url;
  if (s.phone_2) ld.contactPoint = [{ '@type': 'ContactPoint', telephone: s.phone_2, contactType: 'reservations' }];
  return ld;
}

function websiteLd(s) {
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': config.siteUrl + '/#website', url: config.siteUrl + '/', name: s.site_name, inLanguage: 'en-IN' };
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: config.siteUrl + it.path }))
  };
}

function faqLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } }))
  };
}

// Treatment packages as an offer catalogue: names, durations and prices exactly as published on the page.
function packagesLd(s, list) {
  return {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: 'Ayurvedic Treatments & Wellness Packages',
    provider: { '@id': config.siteUrl + '/#business' },
    itemListElement: list.map(p => ({
      '@type': 'Offer',
      name: p.label,
      price: String(p.price),
      priceCurrency: 'INR',
      itemOffered: {
        '@type': 'Service',
        name: p.label,
        serviceType: 'Ayurvedic treatment package',
        description: `${p.duration}. ${p.categoryLabel}. Treatments: ${p.treatmentNames.join(', ')}.`
      }
    }))
  };
}

module.exports = { businessLd, websiteLd, breadcrumbLd, faqLd, packagesLd, abs };
