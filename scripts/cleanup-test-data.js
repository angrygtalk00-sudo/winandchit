const fs = require('fs');
const path = require('path');
// Parse backend/.env manually so this script doesn't require root-level dependencies
let env = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'backend', '.env'), 'utf8');
  raw.split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  });
} catch (e) { /* ignore */ }

const mongoose = require('mongoose');
const Product = require('../backend/models/product');
const Sale = require('../backend/models/sale');

async function main() {
  const uri = env.MONGO_URI || 'mongodb://localhost:27017/winandchit';
  await mongoose.connect(uri, { dbName: 'winandchit' });
  console.log('Connected to', uri);

  // Delete products with title starting with RCPT-
  const prods = await Product.find({ title: { $regex: '^RCPT-' } });
  if (prods.length === 0) {
    console.log('No RCPT- products found');
  } else {
    for (const p of prods) {
      console.log('Deleting product', p._id.toString(), p.title);
      await Product.deleteOne({ _id: p._id });
      // Also delete sales that reference this product
      const sales = await Sale.find({ 'items.productId': p._id });
      for (const s of sales) {
        console.log('Deleting sale', s._id.toString(), 'that references product', p._id.toString());
        await Sale.deleteOne({ _id: s._id });
      }
    }
  }

  await mongoose.disconnect();
  console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
