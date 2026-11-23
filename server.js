const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./src/config');
const { db, migrate } = require('./src/db');
const locals = require('./src/locals');
const auth = require('./src/auth');

migrate();

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '1d' : 0 }));
app.use('/uploads', express.static(config.uploadDir, { maxAge: config.isProd ? '30d' : 0, index: false }));

app.use(locals);
// Must run before Helmet, which builds the CSP header when the request arrives.
app.use((req, res, next) => {
  res.locals.cspPayments = req.method === 'GET' && req.path === '/book' && require('./src/payments').provider() === 'razorpay';
  next();
});

const analyticsOrigin = config.analytics && config.analytics.origin ? [config.analytics.origin] : [];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      // Razorpay Checkout sources are allowed only on the Book page, and only when live keys are configured.
      'script-src': ["'self'", ...analyticsOrigin, (req, res) => res.locals.cspPayments ? 'https://checkout.razorpay.com' : "'self'"],
      'style-src': ["'self'", (req, res) => res.locals.cspPayments ? "'unsafe-inline'" : "'self'"],
      'img-src': ["'self'", 'data:', (req, res) => res.locals.cspPayments ? 'https://cdn.razorpay.com' : "'self'"],
      'connect-src': ["'self'", ...analyticsOrigin, (req, res) => res.locals.cspPayments ? 'https://api.razorpay.com https://lumberjack.razorpay.com' : "'self'"],
      'frame-src': [(req, res) => res.locals.cspPayments ? 'https://api.razorpay.com https://checkout.razorpay.com' : (res.locals.mapOrigin || "'self'")],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use('/api', require('./src/routes/api'));
app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/public'));

app.use((req, res) => {
  res.status(404).render('error', {
    seo: { title: `Page not found | ${res.locals.s.site_name}`, description: 'Page not found.', path: req.path, noindex: true, breadcrumbs: [], jsonld: [] },
    code: 404, heading: 'Page not found', text: 'We could not find that page.', withForm: false
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  const inAdmin = req.path.startsWith('/admin');
  try {
    if (inAdmin) return res.status(500).render('admin/message', { title: 'Something went wrong', message: 'The request could not be completed. Nothing was shown from the error for safety. Try again or contact the site developer.' });
    res.status(500).render('error', {
      seo: { title: `Something went wrong | ${res.locals.s.site_name}`, description: 'Something went wrong.', path: req.path, noindex: true, breadcrumbs: [], jsonld: [] },
      code: 500, heading: 'Something went wrong', text: 'Please try again, or contact the Centre by phone or WhatsApp.', withForm: false
    });
  } catch {
    res.status(500).type('text/plain').send('Something went wrong. Please try again later.');
  }
});

// Delete expired enquiries and sessions once a day.
function housekeeping() {
  try {
    const days = Number(require('./src/settings').getSettings().retention_days) || 0;
    if (days > 0) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const r = db.prepare('DELETE FROM enquiries WHERE created_at < ?').run(cutoff);
      if (r.changes) console.log(`Retention: deleted ${r.changes} old enquiries`);
    }
    auth.purgeSessions();
  } catch (e) { console.error('Housekeeping failed:', e.message); }
}
housekeeping();
setInterval(housekeeping, 24 * 3600 * 1000).unref();

// Release rooms held by bookings that were never paid.
setInterval(() => { try { require('./src/booking').expireHolds(); } catch (e) { console.error('Hold expiry failed:', e.message); } }, 5 * 60 * 1000).unref();

{
  const p = require('./src/payments').provider();
  console.log(p === 'razorpay' ? 'Payments: Razorpay' : p === 'dev' ? 'Payments: DEVELOPMENT simulation (no Razorpay keys set)' : 'Payments: not configured, online booking is closed');
}

app.listen(config.port, () => console.log(`Carmel Heritage running at ${config.siteUrl} (port ${config.port})`));
