const mongoose = require('mongoose');

// Bulk-disable any enabled time-based promotions whose endDate has passed.
// Runs a single atomic updateMany so it stays cheap even on large catalogs.
async function autoExpirePromotions(Product) {
  try {
    await Product.updateMany(
      {
        'promotion.enabled': true,
        'promotion.limitType': 'time',
        'promotion.endDate': { $lt: new Date() }
      },
      { $set: { 'promotion.enabled': false } }
    );
  } catch (err) {
    console.warn('autoExpirePromotions warning:', err && err.message);
  }
}

module.exports = { autoExpirePromotions };
