const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./src/config');
const { migrate } = require('./src/db');
const locals = require('./src/locals');
const payments = require('./src/payments');
const { storageOrigin } = require('./src/uploads');

const app = express();
if (config.trustProxy || config.isServerless) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(compression());
// Local only: on Vercel, files in public/ are served by the CDN and this is skipped.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '1d' : 0 }));

// No database needed: lets uptime monitors check the server itself.
app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));

app.use(locals);
// Must run before Helmet, which builds the CSP header when the request arrives.
app.use((req, res, next) => {
  res.locals.cspPayments = req.method === 'GET' && req.path === '/book' && payments.provider() === 'razorpay';
  next();
});

const analyticsOrigin = config.analytics && config.analytics.origin ? [config.analytics.origin] : [];
const imgOrigin = storageOrigin() ? [storageOrigin()] : [];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      // Razorpay Checkout sources are allowed only on the Book page, and only when keys are configured.
      'script-src': ["'self'", ...analyticsOrigin, (req, res) => res.locals.cspPayments ? 'https://checkout.razorpay.com' : "'self'"],
      'style-src': ["'self'", (req, res) => res.locals.cspPayments ? "'unsafe-inline'" : "'self'"],
      'img-src': ["'self'", 'data:', ...imgOrigin, (req, res) => res.locals.cspPayments ? 'https://cdn.razorpay.com' : "'self'"],
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
    if (!res.locals.s) throw new Error('no settings');
    res.status(500).render('error', {
      seo: { title: `Something went wrong | ${res.locals.s.site_name}`, description: 'Something went wrong.', path: req.path, noindex: true, breadcrumbs: [], jsonld: [] },
      code: 500, heading: 'Something went wrong', text: 'Please try again, or contact the Centre by phone or WhatsApp.', withForm: false
    });
  } catch {
    res.status(500).type('text/plain').send('Something went wrong. Please try again later.');
  }
});

module.exports = app;

// Local server (npm start / npm run dev). On Vercel the exported app is used instead and
// scheduled jobs run through Vercel Cron (see vercel.json).
if (require.main === module) {
  (async () => {
    await migrate();
    const { housekeeping } = require('./src/routes/api');
    const run = () => housekeeping().then(r => { if (r.deletedEnquiries) console.log(`Retention: deleted ${r.deletedEnquiries} old enquiries`); }).catch(e => console.error('Housekeeping failed:', e.message));
    run();
    setInterval(run, 24 * 3600 * 1000).unref();
    setInterval(() => require('./src/booking').expireHolds().catch(e => console.error('Hold expiry failed:', e.message)), 5 * 60 * 1000).unref();
    const p = payments.provider();
    console.log(p === 'razorpay' ? 'Payments: Razorpay' : p === 'dev' ? 'Payments: DEVELOPMENT simulation (no Razorpay keys set)' : 'Payments: not configured, online booking is closed');
    app.listen(config.port, () => console.log(`Carmel Heritage running at ${config.siteUrl} (port ${config.port})`));
  })().catch(e => { console.error('Startup failed:', e.message); process.exit(1); });
}
