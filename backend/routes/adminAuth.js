const express = require('express');
const crypto = require('crypto');
const Admin = require('../models/admin');
const { createToken, validatePermissions } = require('../utils/adminAuth');

const router = express.Router();
const PASSWORD_MIN_LENGTH = 10;

function serializeAdmin(admin) {
  return {
    id: String(admin._id),
    username: admin.username,
    permissions: admin.isOwner ? ['dashboard', 'pos', 'products', 'discounts', 'orders', 'settings', 'messages', 'comments'] : admin.permissions,
    isOwner: admin.isOwner,
    isActive: admin.isActive,
    createdAt: admin.createdAt
  };
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) {
    return 'Username must be 3–32 characters and use only letters, numbers, dots, underscores, or hyphens.';
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
    return `Password must be between ${PASSWORD_MIN_LENGTH} and 128 characters.`;
  }
  return '';
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}

async function passwordMatches(password, storedHash) {
  const [saltHex, hashHex] = String(storedHash || '').split(':');
  if (!saltHex || !hashHex || !/^[a-f\d]+$/i.test(saltHex) || !/^[a-f\d]+$/i.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, (err, key) => {
      if (err) return reject(err);
      resolve(key);
    });
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

router.get('/setup-status', async (req, res, next) => {
  try {
    res.json({ needsSetup: !(await Admin.exists({ isOwner: true })) });
  } catch (err) {
    next(err);
  }
});

router.post('/setup', async (req, res, next) => {
  try {
    if (await Admin.exists({ isOwner: true })) {
      return res.status(409).json({ error: 'Initial owner account has already been created.' });
    }
    const { username, password } = req.body || {};
    const validationError = validateCredentials(username, password);
    if (validationError) return res.status(400).json({ error: validationError });

    await Admin.init();
    const owner = await Admin.create({
      username: username.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      isOwner: true,
      permissions: []
    });
    res.status(201).json({ token: createToken(owner), admin: serializeAdmin(owner) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An owner account already exists or that username is taken.' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const admin = await Admin.findOne({ username: username.trim().toLowerCase() });
    if (!admin || !admin.isActive || !(await passwordMatches(password, admin.passwordHash))) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }
    res.json({ token: createToken(admin), admin: serializeAdmin(admin) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res) => {
  res.json({ admin: serializeAdmin(req.admin) });
});

router.get('/admins', async (req, res, next) => {
  try {
    const admins = await Admin.find({ isOwner: false }).sort({ createdAt: -1 }).select('-passwordHash');
    res.json(admins.map(serializeAdmin));
  } catch (err) {
    next(err);
  }
});

router.post('/admins', async (req, res, next) => {
  try {
    const { username, password, permissions } = req.body || {};
    const validationError = validateCredentials(username, password);
    if (validationError) return res.status(400).json({ error: validationError });
    if (!validatePermissions(permissions)) return res.status(400).json({ error: 'Invalid admin permissions.' });

    const admin = await Admin.create({
      username: username.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      permissions: [...new Set(permissions)],
      isOwner: false
    });
    res.status(201).json(serializeAdmin(admin));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'That username is already in use.' });
    next(err);
  }
});

router.put('/admins/:id', async (req, res, next) => {
  try {
    const admin = await Admin.findOne({ _id: req.params.id, isOwner: false });
    if (!admin) return res.status(404).json({ error: 'Admin account not found.' });

    const { username, password, permissions, isActive } = req.body || {};
    if (username !== undefined) {
      if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) {
        return res.status(400).json({ error: 'Username must be 3–32 characters and use only letters, numbers, dots, underscores, or hyphens.' });
      }
      admin.username = username.trim().toLowerCase();
    }
    if (password !== undefined && password !== '') {
      const validationError = validateCredentials(admin.username, password);
      if (validationError) return res.status(400).json({ error: validationError });
      admin.passwordHash = await hashPassword(password);
    }
    if (permissions !== undefined) {
      if (!validatePermissions(permissions)) return res.status(400).json({ error: 'Invalid admin permissions.' });
      admin.permissions = [...new Set(permissions)];
    }
    if (isActive !== undefined) admin.isActive = Boolean(isActive);
    admin.updatedAt = new Date();
    await admin.save();
    res.json(serializeAdmin(admin));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'That username is already in use.' });
    next(err);
  }
});

router.delete('/admins/:id', async (req, res, next) => {
  try {
    const admin = await Admin.findOneAndDelete({ _id: req.params.id, isOwner: false });
    if (!admin) return res.status(404).json({ error: 'Admin account not found.' });
    res.json({ message: 'Admin account deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
