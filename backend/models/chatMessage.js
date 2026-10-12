const mongoose = require('mongoose');
const { Schema } = mongoose;

const MessageSchema = new Schema({
  conversationId: { type: String, required: true, index: true },
  sender: { type: String, enum: ['customer', 'admin'], required: true },
  text: { type: String, default: '', trim: true },
  imageUrl: { type: String, default: null },
  replyTo: {
    messageId: { type: Schema.Types.ObjectId, default: null },
    sender: { type: String, enum: ['customer', 'admin'] },
    text: { type: String, default: '' }
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    index: true,
    // CCTV style auto-expiration after 60 days (60 * 24 * 60 * 60 seconds = 5184000)
    expires: 5184000 
  }
});

MessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('ChatMessage', MessageSchema);
