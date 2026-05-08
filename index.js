const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Init Firebase Admin
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON env var');
  process.exit(1);
}

// 1. Decode base64 string
const decodedJson = Buffer.from(serviceAccountJson, 'base64').toString('utf-8');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(decodedJson))
});

const db = admin.firestore();

const GUMROAD_SECRET = process.env.GUMROAD_SECRET || '';

// Health check
app.get('/', (req, res) => {
  res.send('Trading Journal Webhook OK');
});

// Gumroad webhook endpoint
app.post('/webhook/gumroad', async (req, res) => {
  try {
    const payload = req.body;
    const email = payload.email;
    const productPermalink = payload.product_permalink || payload.permalink || '';

    if (!email) {
      console.error('No email in payload');
      return res.status(400).send('Missing email');
    }

    // Verify Gumroad signature if secret configured
    if (GUMROAD_SECRET) {
      const signature = req.get('x-gumroad-signature');
      console.log('Signature received:', signature);
    }

    // Only whitelist for Journal and Course (not Pass-only)
    const WHITELIST_PRODUCTS = ['trading-journal-pro', 'trading-course', 'trader-combo'];
    const isWhitelistProduct = WHITELIST_PRODUCTS.some(p => productPermalink.includes(p));

    if (!isWhitelistProduct) {
      console.log('Non-whitelist product, skipping:', productPermalink);
      return res.status(200).send('OK - no whitelist');
    }

    // Normalize email: replace . with _ for Firestore doc ID
    const docId = email.toLowerCase().replace(/\./g, '_');

    await db.collection('whitelist').doc(docId).set({
      purchased: true,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      email: email.toLowerCase(),
      source: 'gumroad',
      productId: productPermalink
    });

    console.log('Whitelisted:', email);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Internal error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Webhook server listening on port', PORT);
});
