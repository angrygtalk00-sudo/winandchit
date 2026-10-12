const mongoose = require('mongoose');
const { Schema } = mongoose;

const CustomerSchema = new Schema({
  name: { type: String },
  email: { type: String, index: true },
  phone: { type: String },
  createdAt: { type: Date, default: Date.now },
  notes: { type: String }
});

module.exports = mongoose.model('Customer', CustomerSchema);
