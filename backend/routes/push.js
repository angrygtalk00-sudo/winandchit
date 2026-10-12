const express = require('express');
const PushSubscription = require('../models/pushSubscription');
const { getPushPublicKey } = require('../utils/webPush');

const router = express.Router();

router.get('/public-key', (req, res) => {
  try {
    res.json({ publicKey: getPushPublicKey() });
  } catch (err) {
    res.status(500).json({ error: 'Could not configure push notifications' });
  }
});

router.post('/subscriptions', async (req, res) => {
  try {
    const { conversationId, subscription } = req.body || {};
    if (!conversationId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'A complete push subscription is required' });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { conversationId: String(conversationId), endpoint: subscription.endpoint, keys: subscription.keys },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'Could not save push subscription' });
  }
});

module.exports = router;