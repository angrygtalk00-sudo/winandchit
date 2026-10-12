const mongoose = require('mongoose');
const { Schema } = mongoose;

const ConversationSchema = new Schema({
  conversationId: { type: String, required: true, unique: true, index: true },
  isGuest: { type: Boolean, default: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  customerName: { type: String, default: 'Guest Visitor' },
  customerPhone: { type: String, default: '' },
  lastMessage: { type: String, default: '' },
  lastMessageAt: { 
    type: Date, 
    default: Date.now,
    index: true,
    // CCTV style rolling auto-deletion after 60 days
    expires: 5184000
  },
  unreadByAdmin: { type: Number, default: 0 },
  unreadByCustomer: { type: Number, default: 0 }
});

module.exports = mongoose.model('ChatConversation', ConversationSchema);
