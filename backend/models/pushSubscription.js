const mongoose = require('mongoose');
const { Schema } = mongoose;

const PushSubscriptionSchema = new Schema({
  conversationId: { type: String, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);