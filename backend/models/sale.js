const mongoose = require('mongoose');
const { Schema } = mongoose;

const SaleItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, required: true },
  title: { type: String, required: true },
  color: { type: String },
  size: { type: String },
  attributes: { type: Schema.Types.Mixed, default: {} },
  image: { type: String },
  qty: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  originalPrice: { type: Number },
  hasDiscount: { type: Boolean, default: false },
  discountPercentage: { type: Number, default: 0 },
  subtotal: { type: Number, required: true }
}, { _id: false });

const RefundSchema = new Schema({
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true, min: 0 },
  items: { type: [SaleItemSchema], required: true },
  reason: { type: String, default: '' }
}, { _id: false });

const SaleSchema = new Schema({
  date: { type: Date, default: Date.now },
  items: { type: [SaleItemSchema], required: true },
  total: { type: Number, required: true },
  paymentMethod: { type: String, default: 'cash' },
  cashier: { type: String },
  saleType: { type: String, enum: ['local', 'online', 'adjustment'], default: 'local' },
  // Optional order-related fields for packing/delivery
  status: { type: String, default: 'new' },
  orderPlacedAt: { type: Date },
  confirmedAt: { type: Date },
  packedAt: { type: Date },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  customer: {
    name: { type: String },
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    deliveryStation: { type: String }
  },
  // Cancellation / refund metadata
  cancelled: { type: Boolean, default: false },
  cancelledAt: { type: Date },
  cancellationReason: { type: String },
  // Refunds are an audit trail on the original sale; they never create a separate sale.
  refunds: { type: [RefundSchema], default: [] },
  paymentSlipId: { type: Schema.Types.ObjectId },
  paymentSlipUrl: { type: String, default: '' },
  conversationId: { type: String, default: '', index: true },
  customerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  receiptNumber: { type: String, index: true }
});

// helper static for daily/monthly aggregation with optional date filtering
SaleSchema.statics.analyticsMatch = function () {
  return {
    cancelled: { $ne: true },
    saleType: { $ne: 'adjustment' },
    $or: [
      { saleType: { $ne: 'online' } },
      { confirmedAt: { $ne: null } }
    ]
  };
};

SaleSchema.statics.aggregateTotals = function (groupBy, startDate, endDate) {
  // groupBy: 'day' or 'month'
  const dateTrunc = groupBy === 'month'
    ? { $dateToString: { format: "%Y-%m", date: "$date" } }
    : { $dateToString: { format: "%Y-%m-%d", date: "$date" } };

  const pipeline = [];

  // Gross sales only. Refunds are aggregated separately by their refund date.
  const match = this.analyticsMatch();
  if (startDate || endDate) {
    match.date = {};
    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      match.date.$gte = s;
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      match.date.$lte = e;
    }
  }

  pipeline.push({ $match: match });

  pipeline.push(
    {
      $group: {
        _id: dateTrunc,
        totalRevenue: { $sum: "$total" },
        totalItems: { $sum: { $sum: "$items.qty" } },
        orderCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  );

  return this.aggregate(pipeline);
};

module.exports = mongoose.model('Sale', SaleSchema);
