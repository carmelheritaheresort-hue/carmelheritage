const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { db } = require('../db');
const config = require('../config');
const content = require('../content');
const mail = require('../mail');
const { validate } = require('../../public/js/validation.js');
const { todayIST, wrap } = require('../util');
const { getSettings } = require('../settings');
const booking = require('../booking');
const payments = require('../payments');
const guests = require('../guests');
const auth = require('../auth');
const calc = require('../../public/js/booking-calc.js');

const router = express.Router();

// Note: on Vercel each server instance keeps its own counters, so these limits are per instance.
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many enquiries from this connection. Please call the Centre instead.' }
});

router.post('/enquiries', limiter, express.json({ limit: '10kb' }), wrap(async (req, res) => {
  if (!req.is('application/json') || req.get('x-requested-with') !== 'fetch') {
    return res.status(400).json({ ok: false, error: 'Bad request.' });
  }
  const b = req.body && typeof req.body === 'object' ? req.body : {};

  // Spam traps: hidden field must be empty and the form must have been open for a moment.
  if (b.website || Number(b.elapsed) < 1500) return res.json({ ok: true });

  let maxUnits;
  try { maxUnits = content.formContext(await content.accommodation()).maxUnits; } catch { maxUnits = undefined; }
  const result = validate(b, { today: todayIST(), maxUnits });
  if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });

  const d = result.clean;
  const now = new Date().toISOString();
  try {
    const id = await db.insert(`INSERT INTO enquiries
      (type,status,name,phone,email,check_in,check_out,adults,children,accommodation_pref,units,treatment,message,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      d.type, 'new', d.name, d.phone, d.email, d.check_in || '', d.check_out || '',
      d.adults || 0, d.children || 0, d.accommodation_pref || '', d.units || 0, d.treatment || '', d.message, now, now);
    await guests.attach('enquiries', { id, name: d.name, phone: d.phone, email: d.email, created_at: now }, 'enquiry');
    const s = await getSettings();
    // Awaited: a serverless function may be frozen as soon as the response is sent.
    await mail.notifyEnquiry({ ...d, id }, s.notify_email || config.notifyEmail, `${config.siteUrl}/admin/enquiries/${id}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('Enquiry save failed:', e.message);
    // The browser still opens WhatsApp; the guest can always reach the Centre.
    res.status(503).json({ ok: false, error: 'Saved copy unavailable.' });
  }
}));

// ---- Online booking --------------------------------------------------------
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many booking attempts from this connection. Please call the Centre instead.' }
});
const availLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests.' } });

const fetchOnly = (req, res, next) => (req.is('application/json') && req.get('x-requested-with') === 'fetch')
  ? next() : res.status(400).json({ ok: false, error: 'Bad request.' });

function bookingOpen(s) { return !!s.booking_enabled && !!payments.provider(); }

function guestUrl(b) { return `${config.siteUrl}/book/confirmation/${b.ref}?t=${b.token}`; }

async function afterPaid(b) {
  const s = await getSettings();
  await mail.notifyBooking(b, {
    centreTo: s.notify_email || config.notifyEmail, siteName: s.site_name,
    adminUrl: `${config.siteUrl}/admin/bookings/${b.id}`, guestUrl: guestUrl(b),
    replyHours: Number(s.booking_reply_hours) || 0, phones: [s.phone_1, s.phone_2].filter(Boolean)
  });
}

router.get('/availability', availLimiter, wrap(async (req, res) => {
  const ci = String(req.query.check_in || ''), co = String(req.query.check_out || '');
  if (!calc.isDate(ci) || !calc.isDate(co) || co <= ci || ci < todayIST() || calc.days(ci, co) > calc.MAX_NIGHTS) {
    return res.status(400).json({ ok: false, error: 'Choose valid dates.' });
  }
  try {
    await booking.expireHolds();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, availability: await booking.availability(ci, co) });
  } catch (e) {
    console.error('Availability failed:', e.message);
    res.status(503).json({ ok: false, error: 'Availability is not available right now. Please call the Centre.' });
  }
}));

router.post('/bookings', bookingLimiter, express.json({ limit: '10kb' }), fetchOnly, wrap(async (req, res) => {
  const s = await getSettings();
  if (!bookingOpen(s)) return res.status(503).json({ ok: false, error: 'Online booking is not open. Please send an enquiry or call the Centre.' });
  const b0 = req.body && typeof req.body === 'object' ? req.body : {};
  if (b0.website) return res.status(400).json({ ok: false, error: 'Bad request.' });

  await booking.expireHolds();
  const result = await booking.createPending(b0, s, payments.provider());
  if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors, availability: result.availability });
  const b = result.booking;
  await guests.attach('bookings', b, 'online booking');

  if (payments.provider() === 'dev') {
    return res.json({ ok: true, provider: 'dev', ref: b.ref, token: b.token, amount: b.pay_now_paise });
  }
  try {
    const order = await payments.createOrder({
      amountPaise: b.pay_now_paise, receipt: b.ref,
      notes: { booking_ref: b.ref, check_in: b.check_in, check_out: b.check_out }
    });
    await booking.setOrder(b.id, order.id);
    res.json({
      ok: true, provider: 'razorpay', ref: b.ref, token: b.token, amount: b.pay_now_paise,
      checkout: {
        key: payments.keyId(), order_id: order.id, amount: b.pay_now_paise, currency: 'INR',
        name: s.site_name, description: `Booking ${b.ref}`,
        prefill: { name: b.name, email: b.email, contact: b.phone },
        notes: { booking_ref: b.ref }, theme: { color: '#1d3328' }
      }
    });
  } catch (e) {
    console.error(e.message);
    await booking.markFailed(b, 'Could not start payment: ' + e.message);
    res.status(502).json({ ok: false, error: 'We could not start the payment. Nothing has been charged. Please try again in a moment or call the Centre.' });
  }
}));

async function loadOwned(req, res) {
  const b = await booking.byRef(req.params.ref);
  if (!b || !booking.tokenOk(b, req.body && req.body.token)) { res.status(404).json({ ok: false, error: 'Booking not found.' }); return null; }
  return b;
}

router.post('/bookings/:ref/verify', bookingLimiter, express.json({ limit: '5kb' }), fetchOnly, wrap(async (req, res) => {
  const b = await loadOwned(req, res); if (!b) return;
  const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body;
  if (b.provider !== 'razorpay' || oid !== b.provider_order_id || !payments.verifyPaymentSignature(oid, pid, sig)) {
    await booking.addNote(b.id, 'A payment confirmation with an invalid signature was rejected.');
    return res.status(400).json({ ok: false, error: 'We could not verify the payment. If money was taken, please contact the Centre with your reference ' + b.ref + '.' });
  }
  const { booking: paid, changed } = await booking.markPaid(b, pid);
  if (changed) await afterPaid(paid);
  res.json({ ok: true, redirect: `/book/confirmation/${paid.ref}?t=${paid.token}` });
}));

// Development only: pretend the payment succeeded so the flow can be tried without a gateway.
router.post('/bookings/:ref/simulate', express.json({ limit: '5kb' }), fetchOnly, wrap(async (req, res) => {
  if (payments.provider() !== 'dev') return res.status(404).json({ ok: false, error: 'Not found.' });
  const b = await loadOwned(req, res); if (!b) return;
  if (b.provider !== 'dev') return res.status(400).json({ ok: false, error: 'Bad request.' });
  const { booking: paid, changed } = await booking.markPaid(b, 'dev_' + Date.now());
  if (changed) { await booking.addNote(paid.id, 'TEST ONLY: payment was simulated on a development server. No money was taken.'); await afterPaid(paid); }
  res.json({ ok: true, redirect: `/book/confirmation/${paid.ref}?t=${paid.token}` });
}));

router.post('/bookings/:ref/abandon', express.json({ limit: '5kb' }), fetchOnly, wrap(async (req, res) => {
  const b = await loadOwned(req, res); if (!b) return;
  await booking.markFailed(b, 'Guest closed the payment window without paying.');
  res.json({ ok: true });
}));

// Razorpay webhook: the reliable record of payment, even if the guest closes the browser.
router.post('/payments/razorpay/webhook', express.raw({ type: 'application/json', limit: '100kb' }), wrap(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!payments.verifyWebhook(raw, req.get('x-razorpay-signature'))) return res.status(400).send('bad signature');
  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).send('bad json'); }
  try {
    const pay = evt.payload && evt.payload.payment && evt.payload.payment.entity;
    const order = evt.payload && evt.payload.order && evt.payload.order.entity;
    const orderId = (order && order.id) || (pay && pay.order_id);
    const b = orderId ? await booking.byOrder(orderId) : null;
    if (b) {
      if (evt.event === 'order.paid' || evt.event === 'payment.captured') {
        if (pay && Number(pay.amount) !== b.pay_now_paise) await booking.addNote(b.id, `Webhook amount ${pay.amount} does not match the expected ${b.pay_now_paise} paise. Check in Razorpay.`);
        const { booking: paid, changed } = await booking.markPaid(b, pay ? pay.id : '');
        if (changed) await afterPaid(paid);
      } else if (evt.event === 'payment.failed') {
        await booking.addNote(b.id, `Payment attempt failed: ${(pay && pay.error_description) || 'no reason given'}`);
      }
    }
  } catch (e) {
    console.error('Webhook handling failed:', e.message);
    return res.status(500).send('error'); // Razorpay retries
  }
  res.json({ ok: true });
}));

// ---- Scheduled housekeeping (Vercel Cron calls this once a day) -------------
async function housekeeping() {
  const out = { expiredHolds: await booking.expireHolds(), deletedEnquiries: 0 };
  const days = Number((await getSettings()).retention_days) || 0;
  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    out.deletedEnquiries = (await db.run('DELETE FROM enquiries WHERE created_at < ?', cutoff)).changes;
  }
  await auth.purgeSessions();
  return out;
}

router.get('/cron/housekeeping', wrap(async (req, res) => {
  const sent = Buffer.from(req.get('authorization') || ''), want = Buffer.from(`Bearer ${config.cronSecret}`);
  if (!config.cronSecret || sent.length !== want.length || !crypto.timingSafeEqual(sent, want)) return res.status(401).json({ ok: false });
  res.json({ ok: true, ...(await housekeeping()) });
}));

router.use((err, req, res, next) => {
  const client = err.status >= 400 && err.status < 500;
  if (!client) console.error('API error:', err);
  res.status(client ? 400 : 500).json({ ok: false, error: client ? 'Bad request.' : 'Something went wrong. Please try again or call the Centre.' });
});

module.exports = router;
module.exports.housekeeping = housekeeping;
