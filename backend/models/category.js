const mongoose = require('mongoose');
const { Schema } = mongoose;

const AttributeSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, default: 'select' }, // 'select' or 'text'
  options: { type: [String], default: [] }
}, { _id: false });

const CategorySchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  subcategories: { type: [String], default: [] },
  attributes: { type: [AttributeSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Category', CategorySchema);
