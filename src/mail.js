const config = require('./config');

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
    });
  }
  return transport;
}

// Never throws: email trouble must not break an enquiry.
async function notifyEnquiry(e, to, adminUrl) {
  const t = getTransport();
  if (!t || !to) return;
  const lines = [
    `New ${e.type} enquiry #${e.id} received on the website.`,
    '',
    `Name: ${e.name}`,
    `Phone: ${e.phone}`,
    e.email ? `Email: ${e.email}` : null,
    e.type === 'stay'
      ? `Check-in: ${e.check_in}\nCheck-out: ${e.check_out}\nAdults: ${e.adults}\nChildren: ${e.children}\nPreference: ${e.accommodation_pref}\nUnits: ${e.units}`
      : e.type === 'package'
        ? `Package: ${e.treatment || '-'}\nPreferred arrival: ${e.check_in || '-'}\nGuests: ${e.adults}`
        : `Treatment: ${e.treatment || '-'}\nPreferred date: ${e.check_in || '-'}`,
    `Message: ${e.message || '-'}`,
    '',
    'This is an enquiry only. The guest may not yet have sent the WhatsApp message.',
    `Manage it: ${adminUrl}`
  ].filter(l => l !== null);
  try {
    await t.sendMail({ from: config.smtp.from || config.smtp.user, to, subject: `New website enquiry #${e.id}`, text: lines.join('\n') });
  } catch (err) {
    console.error('Enquiry email failed:', err.message);
  }
}

const inr = p => 'Rs ' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function bookingLines(b) {
  return [
    `Reference: ${b.ref}`,
    `Check-in: ${b.check_in}`,
    `Check-out: ${b.check_out} (${b.nights} night${b.nights === 1 ? '' : 's'})`,
    b.cottage_units ? `Cottages: ${b.cottage_units} x ${inr(b.cottage_rate * 100)} a night` : null,
    b.standard_units ? `Standard rooms: ${b.standard_units} x ${inr(b.standard_rate * 100)} a night` : null,
    `Guests: ${b.adults} adult${b.adults === 1 ? '' : 's'}, ${b.children} child${b.children === 1 ? '' : 'ren'}`,
    `Room total: ${inr(b.subtotal_paise)}`,
    `GST (${b.gst_percent}%): ${inr(b.gst_paise)}`,
    `Total: ${inr(b.total_paise)}`,
    `Paid online: ${inr(b.pay_now_paise)}`,
    b.total_paise > b.pay_now_paise ? `Balance due at the Centre: ${inr(b.total_paise - b.pay_now_paise)}` : null
  ].filter(l => l !== null);
}

// Never throws. Sends the Centre a notice and the guest a receipt for a paid booking.
async function notifyBooking(b, { centreTo, siteName, adminUrl, guestUrl, replyHours, phones }) {
  const t = getTransport();
  if (!t) return;
  const from = config.smtp.from || config.smtp.user;
  const jobs = [];
  if (centreTo) {
    jobs.push(t.sendMail({
      from, to: centreTo, subject: `Paid booking ${b.ref}: please confirm`,
      text: [`A guest has paid online for booking ${b.ref}. Please check the rooms and confirm or decline.`, '',
        `Name: ${b.name}`, `Phone: ${b.phone}`, `Email: ${b.email}`, ...bookingLines(b),
        `Payment ID: ${b.provider_payment_id || '-'}`, `Message: ${b.message || '-'}`, '', `Manage it: ${adminUrl}`].join('\n')
    }));
  }
  if (b.email) {
    jobs.push(t.sendMail({
      from, to: b.email, subject: `${siteName}: payment received for booking ${b.ref}`,
      text: [`Dear ${b.name},`, '', `Thank you. We have received your payment for the booking below.`,
        replyHours > 0 ? `The Centre will check the rooms and confirm your booking within ${replyHours} hours.` : 'The Centre will check the rooms and confirm your booking.',
        'If the rooms cannot be provided, the amount you paid will be refunded in full.', '',
        ...bookingLines(b), '', `View your booking: ${guestUrl}`, '',
        phones && phones.length ? `Questions? Call ${phones.join(' or ')}.` : ''].join('\n')
    }));
  }
  try { await Promise.all(jobs); } catch (err) { console.error('Booking email failed:', err.message); }
}

module.exports = { notifyEnquiry, notifyBooking };
