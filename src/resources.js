// Schema-driven definitions for the admin content editor.
// field types: text | textarea | number | bool | image | select
const sortApproved = [
  { name: 'sort_order', label: 'Display order', type: 'number', help: 'Lower numbers appear first.' },
  { name: 'approved', label: 'Approved for the public site', type: 'bool', help: 'Untick to hide from visitors.' }
];

module.exports = {
  accommodation: {
    table: 'accommodation_types', label: 'Accommodation', singular: 'accommodation category',
    noCreate: true, noDelete: true, cols: ['name', 'total_units', 'approved'],
    intro: 'Cottages (8) and standard rooms (7) are the supplied inventory. Only fill in details the Centre has confirmed. Empty fields are hidden on the site. Online availability is worked out from paid bookings and the room blocks you add under Bookings.',
    fields: [
      { name: 'name', label: 'Public name', type: 'text', required: true, max: 100 },
      { name: 'total_units', label: 'Total units at the Centre', type: 'number', required: true, min: 0, max: 500, help: 'Total number of units, not units free on a date.' },
      { name: 'summary', label: 'Short summary', type: 'text', max: 300 },
      { name: 'description', label: 'Description', type: 'textarea', max: 3000 },
      { name: 'capacity', label: 'Confirmed capacity', type: 'text', max: 200, help: 'For example: guests per unit. Leave empty until confirmed.' },
      { name: 'bed_info', label: 'Confirmed bed types', type: 'text', max: 200 },
      { name: 'amenities', label: 'Approved amenities (one per line)', type: 'textarea', max: 2000 },
      { name: 'price_per_night', label: 'Online booking price per unit per night (Rs, before GST)', type: 'number', min: 0, max: 1000000, help: 'Used by the Book page. 0 removes this type from online booking. GST is set under Settings.' },
      { name: 'max_adults', label: 'Most adults per unit (online booking)', type: 'number', min: 0, max: 20 },
      { name: 'max_children', label: 'Most children per unit (online booking)', type: 'number', min: 0, max: 20 },
      { name: 'rate_info', label: 'Rates text shown on the Stay pages (optional)', type: 'text', max: 300 },
      { name: 'seasonal_notes', label: 'Seasonal notes', type: 'textarea', max: 1000 },
      { name: 'photo', label: 'Photograph (approved, rights confirmed)', type: 'image' },
      { name: 'photo_alt', label: 'Photograph alt text', type: 'text', max: 200 },
      ...sortApproved
    ]
  },
  packages: {
    table: 'packages', label: 'Packages', singular: 'package', cols: ['name', 'category', 'duration', 'price', 'featured', 'approved'],
    intro: 'Ayurvedic treatment packages shown on the Ayurveda Packages page. Prices are for the treatments listed; accommodation and food are shown separately. "Featured" packages also appear on the homepage.',
    fields: [
      { name: 'name', label: 'Package name', type: 'text', required: true, max: 150 },
      { name: 'category', label: 'Category', type: 'select', options: [['single', 'One treatment session per day'], ['double', 'Two treatment sessions per day']] },
      { name: 'duration', label: 'Duration (for example "7 days" or "1 hour")', type: 'text', required: true, max: 60 },
      { name: 'price', label: 'Price in rupees (numbers only, e.g. 18000)', type: 'number', min: 0, max: 10000000 },
      { name: 'schedule', label: 'Treatments / schedule (one per line, e.g. "Elakizhi + Sirodhara – 3 days")', type: 'textarea', max: 3000 },
      { name: 'summary', label: 'Short note (optional, shown under the name)', type: 'text', max: 300 },
      { name: 'featured', label: 'Feature on the homepage', type: 'bool' },
      { name: 'photo', label: 'Photograph (optional, used on the homepage card)', type: 'image' },
      { name: 'photo_alt', label: 'Photograph alt text', type: 'text', max: 200 },
      ...sortApproved
    ]
  },
  treatments: {
    table: 'treatments', label: 'Treatments', singular: 'treatment', cols: ['name', 'duration', 'approved'],
    intro: 'Add only treatments the Centre has approved. Do not describe cures, prevention, detox results or guaranteed outcomes.',
    fields: [
      { name: 'name', label: 'Treatment name', type: 'text', required: true, max: 150 },
      { name: 'summary', label: 'Short summary', type: 'text', max: 300 },
      { name: 'photo', label: 'Photograph (rights confirmed)', type: 'image' },
      { name: 'photo_alt', label: 'Photograph alt text', type: 'text', max: 200 },
      { name: 'description', label: 'Description', type: 'textarea', max: 4000 },
      { name: 'duration', label: 'Duration', type: 'text', max: 100 },
      { name: 'price', label: 'Price (only if approved for publishing)', type: 'text', max: 100 },
      { name: 'practitioner', label: 'Practitioner information (confirmed only)', type: 'text', max: 300 },
      ...sortApproved
    ]
  },
  facilities: {
    table: 'facilities', label: 'Facilities', singular: 'facility', cols: ['name', 'availability', 'approved'],
    intro: 'List only facilities and experiences confirmed by the owner.',
    fields: [
      { name: 'name', label: 'Facility or experience', type: 'text', required: true, max: 150 },
      { name: 'description', label: 'Description', type: 'textarea', max: 1500 },
      { name: 'availability', label: 'Availability note', type: 'text', max: 200, help: 'For example: "On request". Leave empty if not confirmed.' },
      ...sortApproved
    ]
  },
  gallery: {
    table: 'gallery', label: 'Gallery', singular: 'gallery image', cols: ['alt', 'approved'],
    intro: 'Upload only images the Centre owns or has permission to use. JPEG, PNG, WebP or AVIF up to 5 MB. Prefer images about 1600 px wide.',
    fields: [
      { name: 'image', label: 'Image', type: 'image', required: true },
      { name: 'alt', label: 'Alt text (describe the image)', type: 'text', required: true, max: 200 },
      { name: 'caption', label: 'Caption', type: 'text', max: 200 },
      { name: 'is_illustration', label: 'This is an illustration, not a photograph of the property', type: 'bool' },
      ...sortApproved
    ]
  },
  faqs: {
    table: 'faqs', label: 'FAQs', singular: 'FAQ', cols: ['question', 'category', 'approved'],
    intro: 'Only approved FAQs with an answer appear on the site and in FAQ structured data.',
    fields: [
      { name: 'question', label: 'Question', type: 'text', required: true, max: 200 },
      { name: 'answer', label: 'Answer', type: 'textarea', max: 2000 },
      { name: 'category', label: 'Category', type: 'text', max: 60 },
      ...sortApproved
    ]
  },
  testimonials: {
    table: 'testimonials', label: 'Testimonials', singular: 'testimonial', cols: ['name', 'location', 'approved'],
    intro: 'A testimonial appears only when it has a quote, permission is confirmed and it is approved. No star ratings or review-platform claims are added.',
    fields: [
      { name: 'name', label: 'Guest name', type: 'text', required: true, max: 100 },
      { name: 'location', label: 'Location', type: 'text', max: 100 },
      { name: 'quote', label: 'Approved wording (exact)', type: 'textarea', max: 1500 },
      { name: 'permission_confirmed', label: 'Guest has given permission for this wording', type: 'bool' },
      ...sortApproved
    ]
  },
  management: {
    table: 'management', label: 'Management', singular: 'team member', cols: ['name', 'role', 'approved'],
    intro: 'Add people only with their consent and confirmed titles or qualifications.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, max: 100 },
      { name: 'role', label: 'Role', type: 'text', max: 150 },
      { name: 'bio', label: 'Short biography (confirmed facts only)', type: 'textarea', max: 2000 },
      { name: 'photo', label: 'Photograph (consent and rights confirmed)', type: 'image' },
      { name: 'photo_alt', label: 'Photograph alt text', type: 'text', max: 200 },
      ...sortApproved
    ]
  }
};
