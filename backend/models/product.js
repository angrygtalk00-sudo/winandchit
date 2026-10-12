const mongoose = require('mongoose');
const { Schema } = mongoose;

const VariantSchema = new Schema({
  sku: { type: String, required: true },
  color: { type: String },
  size: { type: String },
  attributes: { type: Schema.Types.Mixed, default: {} }, // Dynamic attributes map: { "Scent": "Tea Tree", "Volume": "100ml" }
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  image: { type: String, default: '' } // Hosted image URL or image path for variant
}, { _id: false });

const ProductSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String, default: 'Clothing' },
  subCategory: { type: String, default: '' },
  entryDate: { type: Date, default: Date.now },
  variants: { type: [VariantSchema], default: [] },
  // Store hosted image URLs
  images: { type: [String], default: [] },
  videoUrl: { type: String, default: '' },
  youtubeUrl: { type: String, default: '' },
  // Optional promotion/discount configuration applied to product or a specific variant
  promotion: {
    enabled: { type: Boolean, default: false },
    title: { type: String, default: '' }, // Campaign title
    discountPercentage: { type: Number, default: 0 },
    limitType: { type: String, enum: ['time', 'quantity'], default: 'time' },
    startDate: { type: Date }, // defaults to 12:00 PM of the day it's set, applied client-side
    endDate: { type: Date }, // defaults to 23:59 of the day it's set, applied client-side
    limitCount: { type: Number, default: 0 }, // max items eligible for discount (quantity limit)
    soldCount: { type: Number, default: 0 }, // count of items sold under this promo
    minQty: { type: Number, default: 0 }, // minimum purchase qty to activate
    variantSku: { type: String, default: '' } // empty = applies to all variants
  },
  tags: { type: [String], default: [] },
  virtualTryOnEnabled: { type: Boolean, default: true },
  metadata: { type: Schema.Types.Mixed },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
});

// Default start/end times (12:00 PM - 23:59) for time-limited promotions missing explicit dates
ProductSchema.pre('save', function (next) {
  const promo = this.promotion;
  if (promo && promo.enabled && promo.limitType === 'time') {
    const base = promo.startDate ? new Date(promo.startDate) : new Date();
    if (!promo.startDate) {
      base.setHours(12, 0, 0, 0);
      promo.startDate = base;
    }
    if (!promo.endDate) {
      const end = new Date(base);
      end.setHours(23, 59, 0, 0);
      promo.endDate = end;
    }
  }
  next();
});

module.exports = mongoose.model('Product', ProductSchema);
