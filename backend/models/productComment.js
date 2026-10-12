const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductCommentSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  parentCommentId: { type: Schema.Types.ObjectId, ref: 'ProductComment', default: null, index: true },
  customerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  conversationId: { type: String, default: '', index: true },
  authorName: { type: String, default: 'Guest Customer', trim: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  productContext: { type: Schema.Types.Mixed, default: null },
  isAdmin: { type: Boolean, default: false },
  readByAdmin: { type: Boolean, default: false },
  readByCustomerAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('ProductComment', ProductCommentSchema);