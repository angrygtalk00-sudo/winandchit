const express = require('express');
const mongoose = require('mongoose');
const ProductComment = require('../models/productComment');
const Product = require('../models/product');
const User = require('../models/user');
const { sendPushToConversation } = require('../utils/webPush');

const router = express.Router();

async function getThreadCommentIds(rootId) {
  const ids = [rootId];
  const seen = new Set([String(rootId)]);
  let parents = [rootId];
  while (parents.length > 0) {
    const children = await ProductComment.find({ parentCommentId: { $in: parents } }).select('_id').lean();
    const nextParents = children
      .map(comment => comment._id)
      .filter(id => {
        const key = String(id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    ids.push(...nextParents);
    parents = nextParents;
  }
  return ids;
}

async function getThreadRootId(comment) {
  let current = comment;
  while (current.parentCommentId) {
    const parent = await ProductComment.findById(current.parentCommentId).select('_id parentCommentId');
    if (!parent) break;
    current = parent;
  }
  return current._id;
}

async function authenticateCustomer({ customerUserId, password }) {
  if (!mongoose.isValidObjectId(customerUserId) || typeof password !== 'string' || !password) return null;
  const user = await User.findById(customerUserId).select('name password isBlocked');
  if (!user || user.isBlocked || user.password !== password) return null;
  return user;
}

router.get('/unread-count', async (req, res) => {
  try {
    res.json({ unreadCount: await ProductComment.countDocuments({ isAdmin: false, readByAdmin: false }) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load comment notifications' });
  }
});

router.get('/', async (req, res) => {
  try {
    const filter = req.query.productId ? { productId: req.query.productId } : {};
    const commentsQuery = ProductComment.find(filter)
      .populate('productId', 'title images variants promotion')
      .sort({ createdAt: -1 });
    if (!req.query.productId) commentsQuery.limit(500);
    const comments = await commentsQuery.lean();
    if (!req.query.productId) await ProductComment.updateMany({ isAdmin: false, readByAdmin: false }, { $set: { readByAdmin: true } });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Could not load comments' });
  }
});

router.post('/notifications', async (req, res) => {
  try {
    const user = await authenticateCustomer(req.body || {});
    if (!user) return res.status(401).json({ error: 'Please sign in to view your comment notifications.' });
    const customerComments = await ProductComment.find({ customerUserId: user._id, isAdmin: false }).select('_id').lean();
    if (customerComments.length === 0) return res.json([]);
    const comments = await ProductComment.find({ parentCommentId: { $in: customerComments.map(comment => comment._id) }, isAdmin: true })
      .populate('productId', 'title')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Could not load comment notifications' });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    const user = await authenticateCustomer(req.body || {});
    if (!user) return res.status(401).json({ error: 'Please sign in to update your comment notifications.' });
    const notificationIds = (Array.isArray(req.body?.notificationIds) ? req.body.notificationIds : [])
      .filter(mongoose.isValidObjectId);
    if (notificationIds.length === 0) return res.json({ modifiedCount: 0 });

    const customerComments = await ProductComment.find({ customerUserId: user._id, isAdmin: false }).select('_id').lean();
    if (customerComments.length === 0) return res.json({ modifiedCount: 0 });
    const result = await ProductComment.updateMany({
      _id: { $in: notificationIds },
      parentCommentId: { $in: customerComments.map(comment => comment._id) },
      isAdmin: true,
      readByCustomerAt: null
    }, { $set: { readByCustomerAt: new Date() } });
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: 'Could not mark notifications as read' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { productId, variantSku, text } = req.body || {};
    if (!mongoose.isValidObjectId(productId) || !String(text || '').trim()) return res.status(400).json({ error: 'Product and comment text are required' });
    const user = await authenticateCustomer(req.body || {});
    if (!user) return res.status(401).json({ error: 'Please sign in to post a comment.' });
    const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const variant = product.variants.find(item => item.sku === String(variantSku || '')) || product.variants[0] || {};
    const promotion = product.promotion || {};
    const promotionApplies = Boolean(promotion.enabled && (!promotion.variantSku || promotion.variantSku === variant.sku));
    const originalPrice = Number(variant.price || 0);
    const discountPercentage = promotionApplies ? Number(promotion.discountPercentage || 0) : 0;
    const productContext = {
      productId: String(product._id),
      title: product.title,
      image: variant.image || product.images?.[0] || '',
      sku: variant.sku || '',
      color: variant.color || variant.attributes?.Color || variant.attributes?.['Shade / Tone'] || '',
      size: variant.size || variant.attributes?.Size || variant.attributes?.['Size / Fit'] || '',
      price: discountPercentage > 0 ? Math.round(originalPrice * (1 - discountPercentage / 100)) : originalPrice,
      originalPrice,
      stock: Number(variant.stock || 0),
      promotion: discountPercentage > 0 ? { title: promotion.title || 'Promotion', discountPercentage } : null
    };
    const comment = await ProductComment.create({
      productId,
      text: String(text).trim(),
      authorName: user.name,
      customerUserId: user._id,
      conversationId: `user_${user._id}`,
      productContext
    });
    res.status(201).json(comment);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not post comment' });
  }
});

router.post('/:id/replies', async (req, res) => {
  try {
    const parent = await ProductComment.findById(req.params.id);
    const text = String(req.body?.text || '').trim();
    if (!parent || !text) return res.status(400).json({ error: 'Comment reply text is required' });
    const productIsAvailable = await Product.exists({ _id: parent.productId, isDeleted: { $ne: true } });
    if (!productIsAvailable) return res.status(404).json({ error: 'Product not found' });
    const reply = await ProductComment.create({ productId: parent.productId, parentCommentId: parent._id, authorName: 'Win & Chit Support', text, productContext: parent.productContext || null, isAdmin: true, readByAdmin: true });
    const conversationId = parent.customerUserId
      ? `user_${parent.customerUserId}`
      : parent.conversationId || '';
    const productId = parent.productContext?.productId || String(parent.productId);
    const sku = parent.productContext?.sku ? `?sku=${encodeURIComponent(parent.productContext.sku)}` : '';
    await sendPushToConversation(conversationId, {
      title: 'Win & Chit replied to your comment',
      body: text,
      url: `/product/${productId}${sku}`,
      tag: `comment-${parent._id}`
    });
    res.status(201).json(reply);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not post comment reply' });
  }
});

router.post('/:id/customer-replies', async (req, res) => {
  try {
    const { customerUserId, password } = req.body || {};
    const text = String(req.body?.text || '').trim();
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(customerUserId) || !text || typeof password !== 'string') {
      return res.status(400).json({ error: 'Sign in and enter a reply before posting.' });
    }

    const user = await authenticateCustomer({ customerUserId, password });
    if (!user) {
      return res.status(401).json({ error: 'Please sign in again to reply.' });
    }

    const comment = await ProductComment.findById(req.params.id).select('_id parentCommentId productId productContext conversationId');
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    const rootId = await getThreadRootId(comment);
    const root = await ProductComment.findById(rootId).select('_id productId productContext conversationId');
    if (!root) return res.status(404).json({ error: 'Comment thread not found.' });

    const productIsAvailable = await Product.exists({ _id: root.productId, isDeleted: { $ne: true } });
    if (!productIsAvailable) return res.status(404).json({ error: 'This product is no longer available.' });

    const reply = await ProductComment.create({
      productId: root.productId,
      parentCommentId: root._id,
      customerUserId: user._id,
      conversationId: `user_${user._id}`,
      authorName: user.name,
      text,
      productContext: root.productContext || null,
      isAdmin: false,
      readByAdmin: false
    });
    res.status(201).json(reply);
  } catch (err) {
    console.error('Failed to post customer comment reply:', err);
    res.status(500).json({ error: 'Could not post your reply.' });
  }
});

router.delete('/thread/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }
    const comment = await ProductComment.findById(req.params.id).select('_id parentCommentId');
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const rootId = await getThreadRootId(comment);
    const deletedIds = (await getThreadCommentIds(rootId)).map(String);
    await ProductComment.deleteMany({ _id: { $in: deletedIds } });
    res.json({ message: 'Comment thread deleted', deletedIds });
  } catch (err) {
    console.error('Failed to delete comment thread:', err);
    res.status(500).json({ error: 'Could not delete comment thread' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }
    const comment = await ProductComment.findById(req.params.id).select('_id parentCommentId');
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    if (!comment.parentCommentId) {
      const deletedIds = (await getThreadCommentIds(comment._id)).map(String);
      await ProductComment.deleteMany({ _id: { $in: deletedIds } });
      return res.json({ message: 'Comment and its replies deleted', deletedIds });
    }

    await ProductComment.updateMany(
      { parentCommentId: comment._id },
      { $set: { parentCommentId: comment.parentCommentId } }
    );
    await ProductComment.deleteOne({ _id: comment._id });
    res.json({ message: 'Comment deleted', deletedIds: [String(comment._id)] });
  } catch (err) {
    console.error('Failed to delete product comment:', err);
    res.status(500).json({ error: 'Could not delete comment' });
  }
});

module.exports = router;