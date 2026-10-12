const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const PushSubscription = require('../models/pushSubscription');

let vapidKeys;

function getVapidKeys() {
  if (vapidKeys) return vapidKeys;

  const keyFile = path.join(__dirname, '..', '.push-vapid-keys.json');
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    try {
      vapidKeys = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    } catch (err) {
      vapidKeys = webpush.generateVAPIDKeys();
      fs.writeFileSync(keyFile, JSON.stringify(vapidKeys), { mode: 0o600 });
    }
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@winandchit.local',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  return vapidKeys;
}

function getPushPublicKey() {
  return getVapidKeys().publicKey;
}

async function sendPushToConversation(conversationId, payload) {
  if (!conversationId) return;
  const subscriptions = await PushSubscription.find({ conversationId }).lean();
  const message = JSON.stringify({
    title: payload.title || 'Win & Chit',
    body: payload.body || 'You have a new update.',
    url: payload.url || '/',
    tag: payload.tag || `winandchit-${conversationId}`
  });

  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, message, { TTL: 60 });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        return;
      }
      console.warn('Push delivery failed:', err.message);
    }
  }));
}

module.exports = { getPushPublicKey, sendPushToConversation };