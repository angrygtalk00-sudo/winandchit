const express = require('express');
const mongoose = require('mongoose');
const Sale = require('../models/sale');
const Product = require('../models/product');
const Setting = require('../models/setting');
const ChatConversation = require('../models/chatConversation');
const ChatMessage = require('../models/chatMessage');
const { autoExpirePromotions } = require('../utils/promotion');
const { sendPushToConversation } = require('../utils/webPush');

const router = express.Router();

// Helper: atomic decrement of a variant's stock (fallback for non-replica set)
async function decrementVariantStockAtomic(productId, sku, qty) {
  const res = await Product.updateOne(
    { _id: productId, 'variants.sku': sku, 'variants.stock': { $gte: qty } },
    { $inc: { 'variants.$.stock': -qty } }
  );
  return res.matchedCount && res.modifiedCount;
}

async function sendOrderChatUpdate(conversationId, text) {
  if (!conversationId) return;
  const message = await ChatMessage.create({ conversationId, sender: 'admin', text });
  await ChatConversation.updateOne(
    { conversationId },
    { $set: { lastMessage: text, lastMessageAt: message.createdAt }, $inc: { unreadByCustomer: 1 } }
  );
  await sendPushToConversation(conversationId, {
    title: 'Order update from Win & Chit',
    body: text,
    url: '/account',
    tag: `order-${conversationId}`
  });
}

function buildOrderItems(items) {
  return items.map(item => {
    const qty = Math.max(1, Number(item.qty) || 1);
    const unitPrice = Math.max(0, Number(item.unitPrice ?? item.price) || 0);
    const originalPrice = Math.max(0, Number(item.originalPrice) || unitPrice);
    return {
      productId: item.productId,
      sku: item.sku,
      title: item.title || 'Item',
      color: item.color || '',
      size: item.size || '',
      image: item.image || '',
      qty,
      unitPrice,
      originalPrice,
      hasDiscount: originalPrice > unitPrice,
      discountPercentage: originalPrice > unitPrice ? Math.round((1 - unitPrice / originalPrice) * 100) : 0,
      subtotal: qty * unitPrice
    };
  });
}

// Creates a payment-pending online order. Stock is intentionally committed only after staff confirmation.
router.post('/pending-order', async (req, res) => {
  try {
    const { items, customer, paymentMethod, paymentSlipUrl, conversationId, customerUserId } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
    if (!customer?.name?.trim() || !customer?.phone?.trim() || !customer?.address?.trim()) return res.status(400).json({ error: 'Name, phone, and address are required' });
    if (!paymentMethod || !paymentSlipUrl) return res.status(400).json({ error: 'Bank selection and transfer receipt are required' });

    const orderItems = buildOrderItems(items);
    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const order = await Sale.create({
      items: orderItems,
      total,
      paymentMethod,
      cashier: 'Online Checkout',
      saleType: 'online',
      status: 'pending',
      orderPlacedAt: new Date(),
      customer: {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        address: customer.address.trim(),
        deliveryStation: typeof customer.deliveryStation === 'string' ? customer.deliveryStation.trim() : ''
      },
      paymentSlipUrl,
      conversationId: conversationId || '',
      customerUserId: customerUserId || null,
      receiptNumber: `W&C-${Date.now()}`
    });

    const summary = orderItems.map(item => `${item.title} (${item.size || item.sku}) x${item.qty}`).join(', ');
    const orderMessage = `New payment-pending order ${order.receiptNumber}\nItems: ${summary}\nBank: ${paymentMethod}\nTotal: ${total.toLocaleString()} Ks\nShipping: ${customer.address.trim()}`;
    if (conversationId) {
      await ChatConversation.findOneAndUpdate(
        { conversationId },
        {
          $setOnInsert: {
            conversationId,
            isGuest: !customerUserId,
            userId: customerUserId || null,
            customerName: customerUserId ? customer.name.trim() : 'Guest Session',
            customerPhone: customerUserId ? customer.phone.trim() : ''
          },
          $set: { lastMessage: orderMessage, lastMessageAt: new Date() },
          $inc: { unreadByAdmin: 1 }
        },
        { upsert: true, new: true }
      );
      await ChatMessage.create({ conversationId, sender: 'customer', text: orderMessage, imageUrl: paymentSlipUrl });
    }
    await sendOrderChatUpdate(
      conversationId,
      `⏳ Order ${order.receiptNumber} submitted - waiting for admin confirmation.\n(အော်ဒါနံပါတ် ${order.receiptNumber} ကို တင်သွင်းပြီးပါပြီ - စီမံခန့်ခွဲသူ၏ အတည်ပြုချက်ကို စောင့်ဆိုင်းနေပါသည်။)`
    );
    res.status(201).json({ orderId: order._id, receiptNumber: order.receiptNumber, status: order.status, total });
  } catch (err) {
    console.error('Create pending order error:', err);
    res.status(400).json({ error: err.message || 'Could not submit order' });
  }
});

// Staff confirmation validates stock and turns a pending transfer into a new order.
router.post('/:id/confirm', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Order not found' });
    if (!['pending', 'new'].includes(sale.status)) return res.status(400).json({ error: 'Only pending or new orders can be confirmed' });

    if (sale.status === 'pending') {
      for (const item of sale.items) {
        const updated = await decrementVariantStockAtomic(item.productId, item.sku, item.qty);
        if (!updated) return res.status(400).json({ error: `Insufficient stock for ${item.title} (${item.sku})` });
      }
    }

    sale.status = 'new';
    sale.confirmedAt = sale.confirmedAt || new Date();
    await sale.save();
    await sendOrderChatUpdate(
      sale.conversationId,
      `✅ Payment verified for order ${sale.receiptNumber}. Your order is confirmed and will be prepared shortly.\n(အော်ဒါနံပါတ် ${sale.receiptNumber} ၏ ငွေပေးချေမှုကို အတည်ပြုပြီးပါပြီ။ သင့်အော်ဒါကို အတည်ပြုပြီးဖြစ်၍ မကြာမီ အစပြုပြင်ဆင်ပေးပါမည်။)`
    );
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not confirm order' });
  }
});

// Checkout endpoint: expects { items: [{ productId, sku, qty, unitPrice, color, size, image }], paymentMethod, cashier, customer }
router.post('/checkout', async (req, res) => {
  const { items, paymentMethod, cashier, customer, saleType } = req.body || {};
  if (!items || !items.length) return res.status(400).json({ error: 'no items' });

  // Turn off any time-based promotions that have already expired before processing this sale
  await autoExpirePromotions(Product);

  // Try transaction first (for replica set). If not supported, fall back to atomic updates per variant.
  let sale;
  try {
    const session = await mongoose.startSession();
    let usedTransaction = false;
    try {
      session.startTransaction();
      usedTransaction = true;

      // Validate and decrement within transaction
      for (const it of items) {
        const { productId, sku, qty } = it;
        const product = await Product.findById(productId).session(session);
        if (!product) throw new Error('product not found');
        const variant = product.variants.find(v => v.sku === sku);
        if (!variant) throw new Error('variant not found');
        if (variant.stock < qty) throw new Error(`insufficient stock for ${sku}`);
        variant.stock -= qty;

        // Track quantity-based promotion limits
        if (product.promotion && product.promotion.enabled && product.promotion.limitType === 'quantity') {
          const promo = product.promotion;
          const matchVariant = !promo.variantSku || promo.variantSku === sku;
          if (matchVariant) {
            promo.soldCount = (promo.soldCount || 0) + Number(qty);
            if (promo.limitCount > 0 && promo.soldCount >= promo.limitCount) {
              promo.enabled = false;
            }
          }
        }

        await product.save({ session });
      }

      const itemsWithTotals = items.map(it => {
        const origPrice = Number(it.originalPrice) || Number(it.unitPrice) || 0;
        const uPrice = Number(it.unitPrice) || 0;
        const discPct = Number(it.discountPercentage) || (origPrice > uPrice && origPrice > 0 ? Math.round((1 - uPrice / origPrice) * 100) : 0);
        const isDiscounted = Boolean(it.hasDiscount || discPct > 0 || origPrice > uPrice);
        return {
          productId: it.productId,
          sku: it.sku,
          title: it.title || '',
          color: it.color || '',
          size: it.size || '',
          image: it.image || '',
          qty: Number(it.qty) || 1,
          unitPrice: uPrice,
          originalPrice: origPrice,
          hasDiscount: isDiscounted,
          discountPercentage: discPct,
          subtotal: (Number(it.qty) || 1) * uPrice
        };
      });
      const total = itemsWithTotals.reduce((s, i) => s + i.subtotal, 0);
      const receiptNumber = `W&C-${Date.now()}`;
      sale = new Sale({ items: itemsWithTotals, total, paymentMethod, cashier, customer, receiptNumber, saleType: saleType || 'local' });
      await sale.save({ session });

      await session.commitTransaction();
      session.endSession();
      return res.json({ saleId: sale._id, receiptNumber });
    } catch (err) {
      if (usedTransaction) {
        try { await session.abortTransaction(); } catch (e) {}
        session.endSession();
      }
      // If transaction failed due to lack of replica set support or other transient reason, fall back
      // to atomic updates below.
      // But if the error is meaningful (like insufficient stock), propagate it.
      if (err.message && !/Transaction|replica set/.test(err.message)) {
        // propagate error
        return res.status(400).json({ error: err.message });
      }
      // else fall through to fallback
    }
  } catch (errOuter) {
    // Failed to even start session — fall back to atomic updates
  }

  // Fallback: per-item atomic updates (works on standalone mongod)
  try {
    // For each item, perform an atomic update that ensures stock >= qty
    for (const it of items) {
      const ok = await decrementVariantStockAtomic(it.productId, it.sku, it.qty);
      if (!ok) throw new Error(`insufficient stock or variant missing for ${it.sku}`);

      // Track quantity-based promotion limits in fallback mode
      try {
        const prod = await Product.findById(it.productId);
        if (prod && prod.promotion && prod.promotion.enabled && prod.promotion.limitType === 'quantity') {
          const promo = prod.promotion;
          const matchVariant = !promo.variantSku || promo.variantSku === it.sku;
          if (matchVariant) {
            promo.soldCount = (promo.soldCount || 0) + Number(it.qty);
            if (promo.limitCount > 0 && promo.soldCount >= promo.limitCount) {
              promo.enabled = false;
            }
            await prod.save();
          }
        }
      } catch (e) {
        console.warn('Promo quantity decrement warning:', e?.message);
      }
    }

    const itemsWithTotals = items.map(it => {
      const origPrice = Number(it.originalPrice) || Number(it.unitPrice) || 0;
      const uPrice = Number(it.unitPrice) || 0;
      const discPct = Number(it.discountPercentage) || (origPrice > uPrice && origPrice > 0 ? Math.round((1 - uPrice / origPrice) * 100) : 0);
      const isDiscounted = Boolean(it.hasDiscount || discPct > 0 || origPrice > uPrice);
      return {
        productId: it.productId,
        sku: it.sku,
        title: it.title || '',
        color: it.color || '',
        size: it.size || '',
        image: it.image || '',
        qty: Number(it.qty) || 1,
        unitPrice: uPrice,
        originalPrice: origPrice,
        hasDiscount: isDiscounted,
        discountPercentage: discPct,
        subtotal: (Number(it.qty) || 1) * uPrice
      };
    });
    const total = itemsWithTotals.reduce((s, i) => s + i.subtotal, 0);
    const receiptNumber = `W&C-${Date.now()}`;
    sale = new Sale({ items: itemsWithTotals, total, paymentMethod, cashier, customer, receiptNumber, saleType: saleType || 'local' });
    await sale.save();
    return res.json({ saleId: sale._id, receiptNumber });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Cancel order endpoint: marks sale as cancelled and optionally restocks items
router.post('/:id/cancel', async (req, res) => {
  try {
    const { restock = false, reason } = req.body || {}
    let sale = await Sale.findById(req.params.id)
    if (!sale) return res.status(404).json({ error: 'Sale not found' })
    if (sale.cancelled) return res.status(400).json({ error: 'Sale already cancelled' })
    if ((sale.refunds || []).length > 0) return res.status(400).json({ error: 'Refunded orders cannot be cancelled' })

    // If requested, restore stock quantities
    const stockWasReserved = sale.status !== 'pending'
    if (restock && stockWasReserved) {
      for (const it of sale.items) {
        await Product.updateOne({ _id: it.productId, 'variants.sku': it.sku }, { $inc: { 'variants.$.stock': it.qty } })
      }
    }

    sale.cancelled = true
    sale.cancelledAt = new Date()
    sale.cancellationReason = reason || ''
    sale.status = 'cancelled'
    // create backup of sale before saving cancellation status
    try {
      const Backup = require('../models/backup')
      await Backup.create({ collectionName: 'sales', operation: 'cancel', snapshot: sale.toObject(), docIds: [String(sale._id)], meta: { restock: restock && stockWasReserved } })
    } catch (e) { console.warn('Sale backup failed:', e && e.message) }
    await sale.save()
    await sendOrderChatUpdate(
      sale.conversationId,
      `❌ Order ${sale.receiptNumber} was cancelled. Reason: ${sale.cancellationReason || 'N/A'}.\n(အော်ဒါနံပါတ် ${sale.receiptNumber} ကို ပယ်ဖျက်လိုက်ပါပြီ။ အကြောင်းရင်း: ${sale.cancellationReason || 'N/A'}။)`
    )

    // Optionally, return updated aggregate totals for quick dashboard update
    const totals = await Sale.aggregateTotals('day')
    res.json({ ok: true, totals })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function buildDayRange(startDate, endDate) {
  const range = {}
  if (startDate) {
    const s = new Date(startDate)
    s.setHours(0, 0, 0, 0)
    range.$gte = s
  }
  if (endDate) {
    const e = new Date(endDate)
    e.setHours(23, 59, 59, 999)
    range.$lte = e
  }
  return range
}

// Full refund endpoint. The refund amount always comes from the persisted sale, never the client.
router.post('/:id/refund', async (req, res) => {
  try {
    const { reason } = req.body || {}
    const sale = await Sale.findById(req.params.id)
    if (!sale) return res.status(404).json({ error: 'Sale not found' })
    if (sale.saleType === 'adjustment') return res.status(400).json({ error: 'Adjustment records cannot be refunded' })
    if (sale.cancelled) return res.status(400).json({ error: 'Cancelled orders cannot be refunded' })
    if ((sale.refunds || []).length > 0) return res.status(400).json({ error: 'This order has already been fully refunded' })

    const refundedItems = sale.items.map(item => item.toObject())
    const refundAmount = Number(sale.total || 0)
    if (refundAmount <= 0) return res.status(400).json({ error: 'Order has no refundable amount' })

    const applyRefund = async (session) => {
      for (const item of refundedItems) {
        const query = Product.updateOne(
          { _id: item.productId, 'variants.sku': item.sku },
          { $inc: { 'variants.$.stock': Number(item.qty) } }
        )
        if (session) query.session(session)
        const result = await query
        if (!result.matchedCount) throw new Error(`Variant not found for ${item.sku}`)
      }

      sale.refunds.push({ date: new Date(), amount: refundAmount, items: refundedItems, reason: reason || 'Refund via Orders UI' })
      if (session) await sale.save({ session })
      else await sale.save()
    }

    // Prefer a transaction when MongoDB supports one; standalone MongoDB uses the same logic below.
    try {
      const session = await mongoose.startSession()
      try {
        session.startTransaction()
        await applyRefund(session)
        await session.commitTransaction()
      } catch (errTx) {
        try { await session.abortTransaction() } catch (e) {}
        throw errTx
      } finally {
        session.endSession()
      }
    } catch (txErr) {
      try {
        // Discard in-memory mutations made before a standalone MongoDB transaction failed.
        sale = await Sale.findById(req.params.id)
        if (!sale || (sale.refunds || []).length > 0) {
          return res.status(400).json({ error: 'This order has already been fully refunded' })
        }
        await applyRefund()
      } catch (errFallback) {
        return res.status(500).json({ error: errFallback.message })
      }
    }

    // Gross sales and refunds are reported separately; the dashboard derives net revenue once.
    const totals = await Sale.aggregateTotals('day')
    res.json({ ok: true, refundAmount, totals })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Printable receipt endpoint — returns simple HTML for printing
router.get('/:id/receipt', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).lean();
    if (!sale) return res.status(404).send('Sale not found');

    const settings = await Setting.getOrCreate();
    const sender = settings.sender || {};

    const autoPrint = req.query.autoPrint === '1' ? true : false;
    const date = new Date(sale.date).toLocaleString();
    // simple HTML escaper for receipt fragments
    const escapeHtml = (str) => {
      if (!str && str !== 0) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    let itemsHtml = '';
    for (const it of sale.items) {
      const origPrice = Number(it.originalPrice) || Number(it.unitPrice) || 0;
      const uPrice = Number(it.unitPrice) || 0;
      const discPct = Number(it.discountPercentage) || (origPrice > uPrice && origPrice > 0 ? Math.round((1 - uPrice / origPrice) * 100) : 0);
      const hasDiscount = Boolean(it.hasDiscount || discPct > 0 || origPrice > uPrice);

      // Render exact requested structure: if discount exists, show original price with strikethrough, percentage badge, and discounted final price.
      const unitHtml = (hasDiscount && discPct > 0)
        ? `<div class="discounted-price-display"><span style="text-decoration:line-through;color:#ef4444;margin-right:6px">${origPrice.toLocaleString()} Ks</span><span style="background:#ef4444;color:#fff;padding:2px 4px;border-radius:4px;font-size:10px;margin-right:6px">-${discPct}%</span><span>${uPrice.toLocaleString()} Ks</span></div>`
        : `<span>${uPrice.toLocaleString()} Ks</span>`;

      itemsHtml += `<tr>
        <td style="vertical-align:middle">${escapeHtml(it.title || '')}</td>
        <td class="muted" style="vertical-align:middle">${escapeHtml(it.sku || '')}</td>
        <td class="number" style="vertical-align:middle">${it.qty}</td>
        <td class="number" style="vertical-align:middle">${unitHtml}</td>
        <td class="number" style="vertical-align:middle">${it.subtotal.toLocaleString()} Ks</td>
      </tr>`;
    }

    const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${sender.shopName || 'Win & Chit'} - Receipt ${sale.receiptNumber}</title>
          <style>
          /* Page sizing for A4 */
          @page { size: A4; margin: 14mm }
          html,body{ height:100%; margin:0; padding:0; }
          body{ font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color:#1c1c1c; font-size:11.5px; line-height:1.5; -webkit-print-color-adjust:exact }

          .content { position:relative; z-index:1; max-width:180mm; margin:0 auto }

          /* Watermark: centered within the content block so it sits behind the visible print area, not the full page */
          .watermark { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); opacity:0.05; width:42%; max-width:340px; z-index:0; pointer-events:none }

          /* Header: compact logo + title on the left, receipt meta on the right */
          .header{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom:12px; margin-bottom:16px; border-bottom:2px solid #1c1c1c }
          .header-left{ display:flex; align-items:center; gap:10px }
          .logo { width:42px; height:42px; object-fit:contain; flex-shrink:0 }
          .shop-title { font-size:15px; font-weight:700; margin:0; letter-spacing:0.2px }
          .shop-sub { color:#8a8a8a; font-size:8.5px; text-transform:uppercase; letter-spacing:1px; margin-top:2px }
          .receipt-meta { text-align:right; font-size:10px; color:#555; line-height:1.6 }
          .receipt-meta strong { color:#111; font-size:11px }

          table{ width:100%; border-collapse:collapse; margin-top:4px }
          thead th{ text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:#888; font-weight:700; padding:6px 8px; border-bottom:1.5px solid #1c1c1c }
          tbody td{ padding:7px 8px; font-size:11px; border-bottom:1px solid #eee }
           td.number, th.number{ text-align:right }
           td.muted{ color:#888; font-size:10px }

           /* Unit cell layout for pricing. Always use the same container so rows with and without
             discounts occupy consistent space and alignment. Non-discount rows render only the
             final price line to avoid visual gaps. */
           .unit-cell{ display:flex; flex-direction:column; align-items:flex-end; }
           .unit-cell .orig{ text-decoration:line-through; color:#ef4444; font-size:0.95rem; margin-bottom:2px }
           .unit-cell .final{ display:flex; align-items:center; gap:8px }
           .discount-badge{ background:#ef4444; color:#fff; padding:3px 8px; border-radius:6px; font-size:0.8rem; font-weight:700 }

          .totals{ display:flex; justify-content:flex-end; align-items:baseline; gap:10px; margin-top:14px; padding-top:10px; border-top:1.5px solid #1c1c1c }
          .totals-label{ font-size:10.5px; color:#666 }
          .totals-value{ font-size:15px; font-weight:700 }

          .footer-note{ margin-top:32px; text-align:center; font-size:9px; color:#888 }

          /* Hide controls when printing */
          .no-print{ display:inline-block; margin-top:16px; padding:8px 16px; font-size:11px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer }
          @media print{
            .no-print{ display:none !important }
            body{ padding:0 }
          }
        </style>
      </head>
      <body>
        <div class="content">
          <!-- Single watermark image, centered on the content block, faint and behind all content -->
          <img class="watermark" src="/assets/watermark-logo.png" alt="" />

          <div class="header">
            <div class="header-left">
              <img class="logo" src="/assets/winandchit-logo.png" alt="Win & Chit logo" />
              <div>
                <h1 class="shop-title">${sender.shopName || 'Win & Chit'}</h1>
                <div class="shop-sub">${sender.tagline || 'Clothing Retail'}</div>
              </div>
            </div>
            <div class="receipt-meta">
              <div>Receipt: <strong>${sale.receiptNumber}</strong></div>
              <div>${date}</div>
              <div>Payment: <strong style="text-transform:uppercase">${sale.paymentMethod || 'Cash'}</strong></div>
              ${sender.phone ? `<div>Tel: ${sender.phone}</div>` : ''}
            </div>
          </div>

          <table>
            <thead><tr><th>Item</th><th>SKU</th><th class="number">Qty</th><th class="number">Unit</th><th class="number">Subtotal</th></tr></thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals">
            <span class="totals-label">Total</span>
            <span class="totals-value">${sale.total.toLocaleString()} Ks</span>
          </div>

          <div class="footer-note">${sender.note || 'Thank you for shopping with Win & Chit!'}</div>

          <div>
            <button class="no-print" onclick="window.print()">Print</button>
          </div>
        </div>
        ${autoPrint ? '<script>window.onload = function(){ window.print(); };</script>' : ''}
        ${autoPrint ? '<script>window.onafterprint = function(){ try{ window.close(); }catch(e){} };</script>' : ''}
      </body>
    </html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('error: ' + err.message);
  }
});

// Delete sale (guarded) - only allowed when ALLOW_DELETE_SALES=1 in backend/.env
router.delete('/:id', async (req, res) => {
  try {
    if ((process.env.ALLOW_DELETE_SALES || '') !== '1') {
      return res.status(403).json({ error: 'Deletion disabled' });
    }
    const s = await Sale.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Sale not found' });
    await Sale.deleteOne({ _id: s._id });
    return res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PDF receipt endpoint using PDFKit (optional dependency)
router.get('/:id/receipt.pdf', async (req, res) => {
  try {
    // lazy require so server still runs if pdfkit is not installed
    const PDFDocument = require('pdfkit');
    const sale = await Sale.findById(req.params.id).lean();
    if (!sale) return res.status(404).send('Sale not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${sale.receiptNumber}.pdf"`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text('Win & Chit', { align: 'center' });
    doc.fontSize(10).text('Clothing Retail', { align: 'center' });
    doc.moveDown();
    doc.text(`Receipt: ${sale.receiptNumber}`);
    doc.text(`Date: ${new Date(sale.date).toLocaleString()}`);
    doc.moveDown();

    // table header
    doc.font('Helvetica-Bold');
    doc.text('Item', 40, doc.y, { continued: true });
    doc.text('SKU', 220, doc.y, { continued: true });
    doc.text('Qty', 320, doc.y, { continued: true, width: 40, align: 'right' });
    doc.text('Unit', 380, doc.y, { continued: true, width: 60, align: 'right' });
    doc.text('Subtotal', 460, doc.y, { width: 80, align: 'right' });
    doc.moveDown();
    doc.font('Helvetica');

    for (const it of sale.items) {
      const hasDiscount = Boolean(it.hasDiscount || (it.discountPercentage && Number(it.discountPercentage) > 0));
      doc.text(it.title || '', 40, doc.y, { continued: true });
      doc.text(it.sku, 220, doc.y, { continued: true });
      doc.text(String(it.qty), 320, doc.y, { continued: true, width: 40, align: 'right' });

      if (hasDiscount) {
        const unitLabel = `${it.unitPrice.toLocaleString()} Ks`;
        const origLabel = it.originalPrice ? `${it.originalPrice.toLocaleString()} Ks` : '';
        const badge = it.discountPercentage ? ` -${it.discountPercentage}%` : '';
        // Write discounted unit and include original price in parentheses for clarity
        doc.text(unitLabel + (origLabel ? ` (orig ${origLabel}${badge})` : ''), 380, doc.y, { continued: true, width: 60, align: 'right' });
      } else {
        doc.text(it.unitPrice.toLocaleString() + ' Ks', 380, doc.y, { continued: true, width: 60, align: 'right' });
      }

      doc.text(it.subtotal.toLocaleString() + ' Ks', 460, doc.y, { width: 80, align: 'right' });
      doc.moveDown();
    }

    doc.moveDown();
    doc.font('Helvetica-Bold').text(`Total: ${sale.total.toLocaleString()} Ks`, { align: 'right' });
    doc.end();
  } catch (err) {
    res.status(500).send('error: ' + err.message);
  }
});

// Financial summary for the dashboard. Gross sale dates and refund dates are intentionally independent.
router.get('/report/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const grossRows = await Sale.aggregateTotals('day', startDate, endDate)
    const grossRevenue = grossRows.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0)

    const refundMatch = { cancelled: { $ne: true } }
    if (startDate || endDate) {
      refundMatch['refunds.date'] = buildDayRange(startDate, endDate)
    }

    const refundRows = await Sale.aggregate([
      { $unwind: '$refunds' },
      { $match: refundMatch },
      { $group: { _id: null, totalRefunds: { $sum: { $ifNull: ['$refunds.amount', { $ifNull: ['$refunds.returnedTotal', 0] }] } } } }
    ])
    const totalRefunds = Number(refundRows[0]?.totalRefunds || 0)
    res.json({ grossRevenue, totalRefunds, netRevenue: grossRevenue - totalRefunds })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/report/refunds-detail', async (req, res) => {
  try {
    const { startDate, endDate } = req.query || {}
    const match = { cancelled: { $ne: true }, saleType: { $ne: 'adjustment' } }
    if (startDate || endDate) {
      match['refunds.date'] = buildDayRange(startDate, endDate)
    }

    const rows = await Sale.aggregate([
      { $unwind: '$refunds' },
      { $match: match },
      {
        $project: {
          _id: 0,
          saleId: '$_id',
          receiptNumber: '$receiptNumber',
          refundDate: '$refunds.date',
          refundAmount: { $ifNull: ['$refunds.amount', { $ifNull: ['$refunds.returnedTotal', 0] }] },
          paymentMethod: '$paymentMethod',
          customerName: '$customer.name',
          items: '$refunds.items'
        }
      },
      { $sort: { refundDate: -1 } }
    ])

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/report/net-breakdown', async (req, res) => {
  try {
    const { startDate, endDate } = req.query || {}

    const grossRows = await Sale.aggregateTotals('day', startDate, endDate)
    const grossRevenue = grossRows.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0)

    const refundMatch = { cancelled: { $ne: true } }
    if (startDate || endDate) {
      refundMatch['refunds.date'] = buildDayRange(startDate, endDate)
    }
    const refundRows = await Sale.aggregate([
      { $unwind: '$refunds' },
      { $match: refundMatch },
      { $group: { _id: null, totalRefunds: { $sum: { $ifNull: ['$refunds.amount', { $ifNull: ['$refunds.returnedTotal', 0] }] } } } }
    ])
    const totalRefunds = Number(refundRows[0]?.totalRefunds || 0)

    const saleMatch = Sale.analyticsMatch()
    if (startDate || endDate) {
      saleMatch.date = buildDayRange(startDate, endDate)
    }

    const paymentRows = await Sale.aggregate([
      { $match: saleMatch },
      { $group: { _id: { $ifNull: ['$paymentMethod', 'cash'] }, amount: { $sum: '$total' }, count: { $sum: 1 } } }
    ])

    const settings = await Setting.getOrCreate()
    const bankAccounts = Array.isArray(settings.bankAccounts) ? settings.bankAccounts : []

    const paymentMap = new Map()
    paymentMap.set('cash', { method: 'cash', amount: 0, count: 0, kind: 'cash' })
    bankAccounts.forEach(bank => {
      const name = String(bank.bankName || '').trim()
      if (!name) return
      paymentMap.set(name, { method: name, amount: 0, count: 0, kind: 'bank' })
    })

    for (const row of paymentRows) {
      const method = row._id || 'cash'
      const existing = paymentMap.get(method)
      if (existing) {
        existing.amount = Number(row.amount || 0)
        existing.count = Number(row.count || 0)
      } else {
        paymentMap.set(method, { method, amount: Number(row.amount || 0), count: Number(row.count || 0), kind: 'other' })
      }
    }

    const paymentBreakdown = Array.from(paymentMap.values())
    const netRevenue = grossRevenue - totalRefunds
    res.json({ grossRevenue, totalRefunds, netRevenue, paymentBreakdown })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Sales reports: daily and monthly with optional date filtering (?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD)
router.get('/report/:period', async (req, res) => {
  const period = req.params.period === 'month' ? 'month' : 'day';
  const { startDate, endDate } = req.query;
  try {
    const data = await Sale.aggregateTotals(period, startDate, endDate);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Refunds summary for a date range: returns total returned amount and net adjustment
router.get('/refunds/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query || {}
    const pipeline = []

    // unwind refunds arrays
    pipeline.push({ $unwind: '$refunds' })

    // optional date range filter on refunds.date
    if (startDate || endDate) {
      const match = {}
      match['refunds.date'] = buildDayRange(startDate, endDate)
      pipeline.push({ $match: match })
    }

    pipeline.push({
      $group: {
        _id: null,
        totalReturned: { $sum: { $ifNull: [ '$refunds.amount', { $ifNull: [ '$refunds.returnedTotal', 0 ] } ] } },
        totalNet: { $sum: { $multiply: [ -1, { $ifNull: [ '$refunds.amount', { $ifNull: [ '$refunds.returnedTotal', 0 ] } ] } ] } },
        count: { $sum: 1 }
      }
    })

    const result = await Sale.aggregate(pipeline)
    const out = (result && result[0]) ? result[0] : { totalReturned: 0, totalNet: 0, count: 0 }
    res.json({ totalReturned: Number(out.totalReturned || 0), totalNet: Number(out.totalNet || 0), count: Number(out.count || 0) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// List recent sales (orders) with optional date filtering
router.get('/customer/:userId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ error: 'Invalid customer ID' });
    const orders = await Sale.find({
      saleType: 'online',
      customerUserId: req.params.userId
    }).sort({ date: -1 }).limit(200).lean();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load customer orders' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, orderType, includeCancelled } = req.query;
    const filter = { saleType: { $ne: 'adjustment' } };
    if (includeCancelled !== 'true') filter.cancelled = { $ne: true };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        filter.date.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        filter.date.$lte = e;
      }
    }
    if (orderType) {
      filter.saleType = orderType === 'online' ? 'online' : 'local'
    }
    const list = await Sale.find(filter).sort({ date: -1 }).limit(200).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit shipping information and existing item lines while keeping inventory in sync.
router.put('/:id/order-details', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Order not found' });
    if (sale.cancelled || (sale.refunds || []).length > 0) return res.status(400).json({ error: 'Cancelled or refunded orders cannot be edited' });

    const incomingItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (incomingItems.length === 0) return res.status(400).json({ error: 'An order must contain at least one item' });

    const existingByKey = new Map(sale.items.map(item => [`${item.productId}:${item.sku}`, item]));
    const items = incomingItems.map(item => {
      const key = `${item.productId}:${item.sku}`;
      const existingItem = existingByKey.get(key);
      if (!existingItem) throw new Error('Items cannot be changed to a different product or variant');
      const qty = Math.max(1, Math.floor(Number(item.qty) || 0));
      const unitPrice = Math.max(0, Number(item.unitPrice));
      if (!Number.isFinite(unitPrice)) throw new Error(`Invalid price for ${existingItem.title}`);
      return {
        productId: existingItem.productId,
        sku: existingItem.sku,
        title: existingItem.title,
        color: existingItem.color || '',
        size: existingItem.size || '',
        attributes: existingItem.attributes || {},
        image: existingItem.image || '',
        qty,
        unitPrice,
        originalPrice: Number(existingItem.originalPrice || unitPrice),
        hasDiscount: Number(existingItem.originalPrice || unitPrice) > unitPrice,
        discountPercentage: Number(existingItem.originalPrice || unitPrice) > unitPrice
          ? Math.round((1 - unitPrice / Number(existingItem.originalPrice || unitPrice)) * 100)
          : 0,
        subtotal: qty * unitPrice
      };
    });

    const quantityByKey = list => list.reduce((quantities, item) => {
      const key = `${item.productId}:${item.sku}`;
      quantities.set(key, (quantities.get(key) || 0) + Number(item.qty || 0));
      return quantities;
    }, new Map());
    const oldQuantities = quantityByKey(sale.items);
    const newQuantities = quantityByKey(items);
    const reservedStock = sale.status !== 'pending';
    const decremented = [];

    if (reservedStock) {
      try {
        for (const [key, quantity] of newQuantities) {
          const previous = oldQuantities.get(key) || 0;
          const difference = quantity - previous;
          if (difference <= 0) continue;
          const [productId, sku] = key.split(':');
          if (!await decrementVariantStockAtomic(productId, sku, difference)) throw new Error(`Insufficient stock for ${sku}`);
          decremented.push({ productId, sku, quantity: difference });
        }
      } catch (err) {
        await Promise.all(decremented.map(item => Product.updateOne(
          { _id: item.productId, 'variants.sku': item.sku },
          { $inc: { 'variants.$.stock': item.quantity } }
        )));
        throw err;
      }

      for (const [key, previous] of oldQuantities) {
        const difference = previous - (newQuantities.get(key) || 0);
        if (difference <= 0) continue;
        const [productId, sku] = key.split(':');
        await Product.updateOne(
          { _id: productId, 'variants.sku': sku },
          { $inc: { 'variants.$.stock': difference } }
        );
      }
    }

    const customer = req.body?.customer || {};
    sale.customer = {
      name: String(customer.name || '').trim(),
      phone: String(customer.phone || '').trim(),
      address: String(customer.address || '').trim(),
      city: String(customer.city || '').trim(),
      deliveryStation: String(customer.deliveryStation || '').trim()
    };
    sale.items = items;
    sale.total = items.reduce((sum, item) => sum + item.subtotal, 0);
    await sale.save();
    await sendOrderChatUpdate(sale.conversationId, `Order ${sale.receiptNumber} details were updated by Win & Chit Support.`);
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not update order details' });
  }
});

// Update sale (e.g., add status or notes)
router.put('/:id', async (req, res) => {
  try {
    const existing = await Sale.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Sale not found' });
    const updates = { ...req.body };
    const statusTimestampFields = { packing: 'packedAt', shipped: 'shippedAt', delivered: 'deliveredAt' };
    const timestampField = statusTimestampFields[updates.status];
    if (updates.status && updates.status !== existing.status && timestampField && !existing[timestampField]) {
      updates[timestampField] = new Date();
    }
    const s = await Sale.findByIdAndUpdate(req.params.id, updates, { new: true });
    const deliveryService = s.customer?.deliveryStation || 'N/A';
    const statusMessages = {
      packing: `📦 Order ${s.receiptNumber} is now being packed.\n(အော်ဒါနံပါတ် ${s.receiptNumber} ကို ယခု ထုပ်ပိုးနေပါပြီ။)`,
      shipped: `🚚 Order ${s.receiptNumber} is ready and has been handed over to the delivery service (${deliveryService}).\n(အော်ဒါနံပါတ် ${s.receiptNumber} ကို ပစ္စည်းပို့ဆောင်ရေးကုမ္ပဏီ (${deliveryService}) ထံသို့ အပ်နှံရန် အဆင်သင့်ဖြစ်ပါပြီ။)`,
      delivered: `🎉 Order ${s.receiptNumber} has been successfully delivered by the delivery service (${deliveryService}). Thank you for shopping with us!\n(အော်ဒါနံပါတ် ${s.receiptNumber} ကို ပစ္စည်းပို့ဆောင်ရေးကုမ္ပဏီ (${deliveryService}) ထံသို့ အပ်နှံပြီးစီးပါပြီ။ ကျွန်ုပ်တို့ဆိုင်တွင် ဝယ်ယူအားပေးသည့်အတွက် ကျေးဇူးတင်ပါသည်။)`
    };
    if (req.body?.status && req.body.status !== existing.status && statusMessages[req.body.status]) {
      await sendOrderChatUpdate(s.conversationId, statusMessages[req.body.status]);
    }
    res.json(s);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

