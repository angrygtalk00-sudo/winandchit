const express = require('express');
const router = express.Router();
const User = require('../models/user');

function serializeUser(user) {
  const record = user.toObject();
  return { ...record, membership: record.membership || 'Standard' };
}

// GET all users (sorted newest first)
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users.map(serializeUser));
  } catch (err) {
    console.error('User list error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err.message });
  }
});

// GET the public profile fields needed to refresh a signed-in customer's account view
router.get('/:id/profile', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name phone address role membership isBlocked updatedAt');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(serializeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST register / sign up user
router.post('/register', async (req, res) => {
  try {
    const { name, phone, address, password } = req.body;
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const cleanPhone = phone.trim();
    if (!/^[0-9]+$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Phone number must contain only numeric digits (0-9).' });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }
    const cleanPassword = password.trim();
    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    if (!/^[a-zA-Z0-9]+$/.test(cleanPassword)) {
      return res.status(400).json({ error: 'Password must contain only English letters and numbers (no special or Burmese characters).' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    // Check if user with phone already exists
    let existing = await User.findOne({ phone: cleanPhone });
    if (existing) {
      if (existing.isBlocked) {
        return res.status(403).json({ error: 'This account has been blocked. Please contact support.' });
      }
      return res.status(400).json({ error: 'An account with this phone number already exists. Please login instead.' });
    }

    const user = new User({
      name: name.trim(),
      phone: cleanPhone,
      address: (address || '').trim(),
      password: cleanPassword,
      role: 'Customer',
      isBlocked: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await user.save();
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST login user
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !phone.trim() || !password || !password.trim()) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    const cleanPhone = phone.trim();
    if (!/^[0-9]+$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Phone number must contain only numeric digits (0-9).' });
    }

    const cleanPassword = password.trim();
    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const user = await User.findOne({ phone: cleanPhone });
    if (!user) {
      return res.status(404).json({ error: 'Account not found. Please sign up first.' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ error: 'This account has been blocked by admin.' });
    }

    if (user.password !== cleanPassword) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    res.json(serializeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update user (Edit from Admin)
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, address, password, isBlocked } = req.body;
    const { membership } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If client supplied currentPassword (e.g. from customer profile update), verify it first
    if (req.body.currentPassword !== undefined) {
      if (!req.body.currentPassword || user.password !== req.body.currentPassword.trim()) {
        return res.status(401).json({ error: 'Incorrect current password. Please check and try again.' });
      }
    }

    const updates = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (phone !== undefined) {
      const cleanPhone = phone.trim();
      if (!/^[0-9]+$/.test(cleanPhone)) {
        return res.status(400).json({ error: 'Phone number must contain only numeric digits (0-9).' });
      }
      updates.phone = cleanPhone;
    }
    if (address !== undefined) updates.address = address.trim();
    if (membership !== undefined) {
      if (!['Standard', 'Silver', 'Gold'].includes(membership)) {
        return res.status(400).json({ error: 'Membership must be Standard, Silver, or Gold.' });
      }
      updates.membership = membership;
    }
    if (password !== undefined && password.trim()) {
      const cleanPassword = password.trim();
      if (cleanPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }
      if (!/^[a-zA-Z0-9]+$/.test(cleanPassword)) {
        return res.status(400).json({ error: 'Password must contain only English letters and numbers (no special or Burmese characters).' });
      }
      updates.password = cleanPassword;
    }
    if (isBlocked !== undefined) updates.isBlocked = Boolean(isBlocked);

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (membership !== undefined) {
      console.log('[user-update] membership saved', {
        userId: String(updatedUser._id),
        incoming: membership,
        membership: updatedUser.membership
      });
    }
    res.json(serializeUser(updatedUser));
  } catch (err) {
    console.error('Failed to update user:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH toggle block user
router.patch('/:id/block', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isBlocked = req.body.isBlocked !== undefined ? Boolean(req.body.isBlocked) : !user.isBlocked;
    user.updatedAt = new Date();
    await user.save();

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
