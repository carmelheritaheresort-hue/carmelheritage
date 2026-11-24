// Razorpay integration using its REST API directly (no SDK dependency).
// Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
const crypto = require('crypto');
const config = require('./config');

const rz = config.razorpay;

function provider() {
  if (rz.keyId && rz.keySecret) return 'razorpay';
  if (config.devPayments) return 'dev';
  return '';
}

// How the Book page takes a booking: online payment ('razorpay' or the local 'dev' simulation),
// or, with no gateway connected, a booking request that the Centre confirms ('request').
function bookingMode() { return provider() || 'request'; }

function isTestKey() { return rz.keyId.startsWith('rzp_test_'); }

async function createOrder({ amountPaise, receipt, notes }) {
  const auth = Buffer.from(`${rz.keyId}:${rz.keySecret}`).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
      signal: ctrl.signal
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.id) {
      const why = body && body.error && body.error.description ? body.error.description : `HTTP ${r.status}`;
      throw new Error(`Razorpay order failed: ${why}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'utf8'), y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Checkout success handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
function verifyPaymentSignature(orderId, paymentId, signature) {
  if (!rz.keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', rz.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

// Webhook signature: HMAC_SHA256(raw request body, webhook_secret)
function verifyWebhook(rawBody, signature) {
  if (!rz.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', rz.webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

module.exports = { provider, bookingMode, isTestKey, createOrder, verifyPaymentSignature, verifyWebhook, keyId: () => rz.keyId };
