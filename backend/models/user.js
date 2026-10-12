const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true, index: true },
  address: { type: String, default: '', trim: true },
  membership: { type: String, enum: ['Standard', 'Silver', 'Gold'], default: 'Standard' },
  password: { type: String, required: true },
  role: { type: String, default: 'Customer' },
  isBlocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
