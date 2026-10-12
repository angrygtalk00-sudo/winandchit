const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  permissions: {
    type: [String],
    enum: ['dashboard', 'pos', 'products', 'discounts', 'orders', 'settings', 'messages', 'comments'],
    default: []
  },
  isOwner: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AdminSchema.index(
  { isOwner: 1 },
  { unique: true, partialFilterExpression: { isOwner: true } }
);

module.exports = mongoose.model('Admin', AdminSchema);
