const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const ChatConversation = require('../models/chatConversation');
const ChatMessage = require('../models/chatMessage');
const Sale = require('../models/sale');
const { sendPushToConversation } = require('../utils/webPush');
const { uploadImage, deleteImages } = require('../utils/imageHost');

const chatEventClients = new Map();

async function cleanupChatImages(imageUrls) {
  const results = await deleteImages(imageUrls);
  const failures = results.filter(result => result.error);
  if (failures.length) console.error('Chat image cleanup failed:', failures);
  return failures.length;
}

function publishChatEvent(conversationId, eventName, eventData) {
  const clients = chatEventClients.get(conversationId);
  if (!clients) return;

  const event = `event: ${eventName}\ndata: ${JSON.stringify(eventData)}\n\n`;
  for (const response of clients) {
    if (response.destroyed || response.writableEnded) {
      clients.delete(response);
      continue;
    }
    try {
      response.write(event);
    } catch (err) {
      clients.delete(response);
      console.error('Failed to publish chat event:', err);
    }
  }
  if (clients.size === 0) chatEventClients.delete(conversationId);
}

// Configure multer with memory storage for images only (max 10MB)
const storage = multer.memoryStorage();
const uploadChatPhoto = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Strictly accept only image formats (JPEG, PNG, WEBP, GIF, etc.) and reject video/other files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only photo files are allowed (JPEG, PNG, WEBP). Video and other file types are strictly rejected.'));
    }
  }
});

// Periodic rolling purge helper to enforce 60-day retention for MongoDB records.
async function purgeExpiredMessages() {
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const batchSize = 100;

    while (true) {
      const expiredBatch = await ChatMessage.find({ createdAt: { $lt: sixtyDaysAgo } })
        .select('_id imageUrl')
        .sort({ createdAt: 1, _id: 1 })
        .limit(batchSize)
        .lean();
      if (expiredBatch.length === 0) break;

      await cleanupChatImages(expiredBatch.map(message => message.imageUrl));

      await ChatMessage.deleteMany({
        _id: { $in: expiredBatch.map(message => message._id) },
        createdAt: { $lt: sixtyDaysAgo }
      });
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    // Delete conversations with no activity in 60 days
    await ChatConversation.deleteMany({ lastMessageAt: { $lt: sixtyDaysAgo } });
  } catch (err) {
    console.warn('Chat purge routine encountered error:', err && err.message);
  }
}

// 1. Get or create conversation for customer (Guest or Logged in)
router.post('/conversation', async (req, res) => {
  try {
    const { conversationId, isGuest, userId, customerName, customerPhone } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const shouldRemainGuest = isGuest ?? !userId;
    let convo = await ChatConversation.findOne({ conversationId });
    if (!convo) {
      convo = new ChatConversation({
        conversationId,
        isGuest: shouldRemainGuest,
        userId: userId || null,
        customerName: shouldRemainGuest ? 'Guest Session' : (customerName || 'Customer'),
        customerPhone: shouldRemainGuest ? '' : (customerPhone || ''),
        unreadByAdmin: 0,
        unreadByCustomer: 0,
        lastMessage: '',
        lastMessageAt: new Date()
      });
      await convo.save();
    } else {
      // Update customer profile if updated or logged in
      let updated = false;
      if (shouldRemainGuest && convo.customerName !== 'Guest Session') {
        convo.customerName = 'Guest Session';
        convo.customerPhone = '';
        updated = true;
      } else if (!shouldRemainGuest && customerName && convo.customerName !== customerName) {
        convo.customerName = customerName;
        updated = true;
      }
      if (!shouldRemainGuest && customerPhone && convo.customerPhone !== customerPhone) {
        convo.customerPhone = customerPhone;
        updated = true;
      }
      if (typeof isGuest === 'boolean' && convo.isGuest !== isGuest) {
        convo.isGuest = isGuest;
        updated = true;
      }
      if (userId && String(convo.userId) !== String(userId)) {
        convo.userId = userId;
        updated = true;
      }
      if (updated) {
        await convo.save();
      }
    }

    res.json(convo);
  } catch (err) {
    console.error('Error fetching/creating conversation:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register a storefront visit as a broadcast-capable conversation before a visitor starts a chat.
router.post('/visitor', async (req, res) => {
  try {
    const { conversationId, isGuest, userId, customerName, customerPhone } = req.body || {};
    if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });

    const guest = isGuest ?? !userId;
    const conversation = await ChatConversation.findOneAndUpdate(
      { conversationId },
      { $setOnInsert: { conversationId, isGuest: guest, userId: userId || null, customerName: guest ? 'Guest Visitor' : (customerName || 'Customer'), customerPhone: guest ? '' : (customerPhone || ''), lastMessage: '', lastMessageAt: new Date(), unreadByAdmin: 0, unreadByCustomer: 0 } },
      { new: true, upsert: true }
    );
    res.status(201).json({ conversationId: conversation.conversationId });
  } catch (err) {
    res.status(500).json({ error: 'Could not register visitor' });
  }
});

// Preserve a guest's checkout conversation and order links when they sign in or create an account.
router.post('/migrate-guest', async (req, res) => {
  try {
    const { guestConversationId, userId, customerName, customerPhone } = req.body || {};
    if (!guestConversationId || !userId) return res.status(400).json({ error: 'Guest conversation and user are required' });

    const accountConversationId = `user_${userId}`;
    const guestConversation = await ChatConversation.findOne({ conversationId: guestConversationId });
    const accountConversation = await ChatConversation.findOne({ conversationId: accountConversationId });

    if (guestConversation && guestConversationId !== accountConversationId) {
      if (accountConversation) {
        await ChatMessage.updateMany({ conversationId: guestConversationId }, { $set: { conversationId: accountConversationId } });
        accountConversation.lastMessage = guestConversation.lastMessage || accountConversation.lastMessage;
        accountConversation.lastMessageAt = guestConversation.lastMessageAt > accountConversation.lastMessageAt ? guestConversation.lastMessageAt : accountConversation.lastMessageAt;
        accountConversation.unreadByCustomer += guestConversation.unreadByCustomer || 0;
        accountConversation.unreadByAdmin += guestConversation.unreadByAdmin || 0;
        accountConversation.isGuest = false;
        accountConversation.userId = userId;
        if (customerName) accountConversation.customerName = customerName;
        if (customerPhone) accountConversation.customerPhone = customerPhone;
        await accountConversation.save();
        await ChatConversation.deleteOne({ _id: guestConversation._id });
      } else {
        guestConversation.conversationId = accountConversationId;
        guestConversation.isGuest = false;
        guestConversation.userId = userId;
        if (customerName) guestConversation.customerName = customerName;
        if (customerPhone) guestConversation.customerPhone = customerPhone;
        await guestConversation.save();
        await ChatMessage.updateMany({ conversationId: guestConversationId }, { $set: { conversationId: accountConversationId } });
      }
      await Sale.updateMany(
        { conversationId: guestConversationId },
        { $set: { conversationId: accountConversationId, customerUserId: userId } }
      );
    }

    res.json({ conversationId: accountConversationId });
  } catch (err) {
    console.error('Guest migration error:', err);
    res.status(500).json({ error: 'Could not migrate guest history' });
  }
});

// Stream conversation events to the customer chat view.
router.get('/events/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  let clients = chatEventClients.get(conversationId);
  if (!clients) {
    clients = new Set();
    chatEventClients.set(conversationId, clients);
  }
  clients.add(res);

  const removeClient = () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) chatEventClients.delete(conversationId);
  };
  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      removeClient();
      return;
    }
    res.write(': heartbeat\n\n');
  }, 25000);
  heartbeat.unref();
  res.on('close', removeClient);

  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(': connected\n\n');
});

// 2. Customer: Get messages for conversation
router.get('/messages/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const paginationRequested = req.query.limit !== undefined || req.query.before !== undefined;
    const requestedLimit = paginationRequested ? Number(req.query.limit) : 300;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }

    const limit = paginationRequested ? Math.min(requestedLimit, 100) : 300;
    const filter = {
      conversationId,
      createdAt: { $gte: sixtyDaysAgo }
    };

    if (req.query.before !== undefined) {
      if (!mongoose.isValidObjectId(req.query.before)) {
        return res.status(400).json({ error: 'before must be a valid message ID' });
      }
      const cursor = await ChatMessage.findOne({
        _id: req.query.before,
        conversationId,
        createdAt: { $gte: sixtyDaysAgo }
      }).select('_id createdAt').lean();
      if (!cursor) {
        return res.status(400).json({ error: 'before message was not found in this conversation' });
      }
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }
      ];
    }

    const sort = paginationRequested ? { createdAt: -1, _id: -1 } : { createdAt: 1 };
    const result = await ChatMessage.find(filter)
      .sort(sort)
      .limit(paginationRequested ? limit + 1 : limit)
      .lean();
    const hasMore = paginationRequested && result.length > limit;
    const messages = result.slice(0, limit);
    if (paginationRequested) messages.reverse();

    // If viewer is customer, reset unreadByCustomer
    if (req.query.viewer === 'customer') {
      await ChatConversation.updateOne({ conversationId }, { $set: { unreadByCustomer: 0 } });
    }
    // If viewer is admin, reset unreadByAdmin
    if (req.query.viewer === 'admin') {
      await ChatConversation.updateOne({ conversationId }, { $set: { unreadByAdmin: 0 } });
    }

    res.json(paginationRequested ? { messages, hasMore } : messages);
  } catch (err) {
    console.error('Error getting messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Send message (customer or admin)
router.post('/messages', async (req, res) => {
  try {
    const { conversationId, sender, text, imageUrl, customerName, customerPhone, isGuest, userId, replyTo } = req.body;
    const cleanText = typeof text === 'string' ? text.trim() : '';
    const cleanImage = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null;

    if (!conversationId || !sender || (!cleanText && !cleanImage)) {
      return res.status(400).json({ error: 'Missing required fields: text or imageUrl required' });
    }

    const newMsg = new ChatMessage({
      conversationId,
      sender: sender === 'admin' ? 'admin' : 'customer',
      text: cleanText,
      imageUrl: cleanImage,
      replyTo: replyTo?.messageId ? { messageId: replyTo.messageId, sender: replyTo.sender === 'admin' ? 'admin' : 'customer', text: String(replyTo.text || '').slice(0, 280) } : undefined,
      createdAt: new Date()
    });
    await newMsg.save();

    const summaryText = cleanText || (cleanImage ? '📷 [Photo attachment]' : '');

    // Update conversation summary
    let convo = await ChatConversation.findOne({ conversationId });
    if (!convo) {
      convo = new ChatConversation({
        conversationId,
        isGuest: isGuest ?? !userId,
        userId: userId || null,
        customerName: (isGuest ?? !userId) ? 'Guest Session' : (customerName || 'Customer'),
        customerPhone: (isGuest ?? !userId) ? '' : (customerPhone || ''),
        unreadByAdmin: sender === 'customer' ? 1 : 0,
        unreadByCustomer: sender === 'admin' ? 1 : 0,
        lastMessage: summaryText,
        lastMessageAt: new Date()
      });
      await convo.save();
    } else {
      convo.lastMessage = summaryText;
      convo.lastMessageAt = new Date();
      if (sender === 'customer') {
        convo.unreadByAdmin = (convo.unreadByAdmin || 0) + 1;
        const keepGuestIdentity = isGuest ?? !userId;
        if (keepGuestIdentity) {
          convo.customerName = 'Guest Session';
          convo.customerPhone = '';
        } else {
          if (customerName) convo.customerName = customerName;
          if (customerPhone) convo.customerPhone = customerPhone;
        }
        if (typeof isGuest === 'boolean') convo.isGuest = isGuest;
        if (userId) convo.userId = userId;
      } else {
        convo.unreadByCustomer = (convo.unreadByCustomer || 0) + 1;
      }
      await convo.save();
    }

    if (sender === 'admin') {
      await sendPushToConversation(conversationId, {
        title: 'New message from Win & Chit',
        body: cleanText || 'Win & Chit Support sent you an image.',
        url: '/message',
        tag: `chat-${conversationId}`
      });
    }

    res.status(201).json(newMsg);
  } catch (err) {
    console.error('Error posting message:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin broadcast to all retained registered-user and guest visitor conversations.
router.post('/broadcast', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Broadcast text is required' });
    const conversations = await ChatConversation.find({}).select('conversationId').lean();
    if (conversations.length === 0) return res.json({ delivered: 0 });

    const now = new Date();
    await ChatMessage.insertMany(conversations.map(conversation => ({ conversationId: conversation.conversationId, sender: 'admin', text, createdAt: now })));
    await ChatConversation.bulkWrite(conversations.map(conversation => ({ updateOne: { filter: { conversationId: conversation.conversationId }, update: { $set: { lastMessage: text, lastMessageAt: now }, $inc: { unreadByCustomer: 1 } } } })));
    await Promise.all(conversations.map(conversation => sendPushToConversation(conversation.conversationId, {
      title: 'New message from Win & Chit',
      body: text,
      url: '/message',
      tag: `broadcast-${conversation.conversationId}`
    })));
    res.status(201).json({ delivered: conversations.length });
  } catch (err) {
    res.status(500).json({ error: 'Could not send broadcast' });
  }
});

// 3b. Upload photo for chat attachment (strictly photo formats only, reject video)
router.post('/upload-photo', (req, res) => {
  uploadChatPhoto.single('photo')(req, res, async (err) => {
    if (err) {
      console.warn('Chat photo upload validation error:', err.message);
      return res.status(400).json({ error: err.message || 'Invalid photo upload' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    // Double-check MIME type to strictly reject video
    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only photo formats (JPEG, PNG, WEBP) are allowed. Videos are rejected.' });
    }

    try {
      const result = await uploadImage({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        folder: 'chat-photos'
      });
      return res.status(201).json({ url: result.url, id: result.id, folder: result.folder });
    } catch (uploadErr) {
      console.error('Failed to upload chat image:', uploadErr.message);
      return res.status(502).json({ error: uploadErr.message || 'Failed to upload photo to image hosting' });
    }
  });
});

// 4. Admin: Get all conversations
router.get('/conversations', async (req, res) => {
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const conversations = await ChatConversation.find({
      lastMessageAt: { $gte: sixtyDaysAgo }
    }).sort({ lastMessageAt: -1 }).limit(100);

    res.json(conversations);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Admin: Unread messages count badge
router.get('/unread-count', async (req, res) => {
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const convos = await ChatConversation.find({
      unreadByAdmin: { $gt: 0 },
      lastMessageAt: { $gte: sixtyDaysAgo }
    });
    const totalUnread = convos.reduce((sum, c) => sum + (c.unreadByAdmin || 0), 0);
    res.json({ unreadCount: totalUnread, conversationsWithUnread: convos.length });
  } catch (err) {
    console.error('Error getting unread count:', err);
    res.status(500).json({ error: 'Server error', unreadCount: 0 });
  }
});

// 6. Clear message history while retaining the conversation.
router.delete('/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messagesWithImages = await ChatMessage.find({ conversationId, imageUrl: { $ne: null } })
      .select('imageUrl')
      .lean();
    const deletion = await ChatMessage.deleteMany({ conversationId });
    const imageCleanupFailures = await cleanupChatImages(messagesWithImages.map(message => message.imageUrl));
    const clearedAt = new Date();
    await ChatConversation.updateOne(
      { conversationId },
      {
        $set: {
          lastMessage: '',
          lastMessageAt: clearedAt,
          unreadByAdmin: 0,
          unreadByCustomer: 0
        }
      }
    );
    publishChatEvent(conversationId, 'conversation-cleared', {
      conversationId,
      deletedCount: deletion.deletedCount
    });
    res.json({ success: true, conversationId, deletedCount: deletion.deletedCount, imageCleanupFailures });
  } catch (err) {
    console.error('Error clearing conversation history:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 7. Admin: Delete single message or photo (Admin permission only)
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = await ChatMessage.findById(messageId);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const conversationId = msg.conversationId;
    const deletion = await ChatMessage.deleteOne({ _id: msg._id });
    if (deletion.deletedCount !== 1) {
      return res.status(404).json({ error: 'Message not found' });
    }
    const imageCleanupFailures = await cleanupChatImages([msg.imageUrl]);

    publishChatEvent(conversationId, 'message-deleted', {
      conversationId,
      messageId: String(msg._id)
    });

    // Update conversation summary to latest remaining message
    const latest = await ChatMessage.findOne({ conversationId }).sort({ createdAt: -1 });
    if (latest) {
      await ChatConversation.updateOne(
        { conversationId },
        { 
          $set: { 
            lastMessage: latest.text || (latest.imageUrl ? '📷 [Photo attachment]' : ''),
            lastMessageAt: latest.createdAt
          }
        }
      );
    } else {
      await ChatConversation.updateOne(
        { conversationId },
        { $set: { lastMessage: '', lastMessageAt: new Date() } }
      );
    }

    res.json({ success: true, messageId, imageCleanupFailures });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 8. Customer: Unread message count badge for phone/customer nav
router.get('/customer-unread', async (req, res) => {
  try {
    const { conversationId } = req.query;
    if (!conversationId) {
      return res.json({ unreadCount: 0 });
    }
    const convo = await ChatConversation.findOne({ conversationId }).select('unreadByCustomer').lean();
    res.json({ unreadCount: convo?.unreadByCustomer || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error', unreadCount: 0 });
  }
});

router.purgeExpiredMessages = purgeExpiredMessages;

module.exports = router;
