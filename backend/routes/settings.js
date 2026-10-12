const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const multer = require('multer');
const Setting = require('../models/setting');
const { uploadImage, listImages, listFolders, deleteImages } = require('../utils/imageHost');

const router = express.Router();

function getSettingsImageUrls(settings) {
  return [...new Set([
    ...(settings?.banners || []).map(item => item.url),
    ...(settings?.bankAccounts || []).map(item => item.logoUrl),
    ...(settings?.deliveryServices || []).map(item => item.logoUrl)
  ].filter(value => typeof value === 'string' && value.trim()))];
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    callback(allowedTypes.includes(file.mimetype) ? null : new Error('Only JPEG, PNG, GIF, WebP, and SVG images are allowed'), allowedTypes.includes(file.mimetype));
  }
});

function receiveImage(fieldName) {
  return (req, res, next) => upload.single(fieldName)(req, res, err => {
    if (!err) return next();
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.message || 'Invalid image upload' });
  });
}

// GET settings
router.get('/', async (req, res) => {
  try {
    const settings = await Setting.getOrCreate();
    res.json(settings);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update settings
router.put('/', async (req, res) => {
  try {
    const { sender, bankAccounts, deliveryServices, banners } = req.body || {};
    const currentSettings = await Setting.getOrCreate();
    const previousImageUrls = new Set(getSettingsImageUrls(currentSettings));
    const updates = {};

    if (sender) {
      updates.sender = {
        ...currentSettings.sender.toObject(),
        ...sender
      };
    }

    if (Array.isArray(bankAccounts)) {
      updates.bankAccounts = bankAccounts;
    }

    if (Array.isArray(deliveryServices)) {
      updates.deliveryServices = deliveryServices;
    }

    if (Array.isArray(banners)) {
      updates.banners = banners;
    }

    const settings = Object.keys(updates).length > 0
      ? await Setting.findOneAndUpdate(
        { _id: currentSettings._id },
        { $set: updates },
        { new: true, runValidators: true }
      )
      : currentSettings;

    const currentImageUrls = new Set(getSettingsImageUrls(settings));
    const removedImageUrls = [...previousImageUrls].filter(url => !currentImageUrls.has(url));
    const cleanupResults = await deleteImages(removedImageUrls);
    const cleanupFailures = cleanupResults.filter(result => result.error);
    if (cleanupFailures.length) console.error('Removed settings image cleanup failed:', cleanupFailures);

    res.json({ ...settings.toObject(), imageCleanupFailures: cleanupFailures.length });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(400).json({ error: err.message });
  }
});

async function uploadLogo(req, res, folder) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const result = await uploadImage({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      folder
    });
    res.status(201).json({ url: result.url, id: result.id, folder: result.folder });
  } catch (err) {
    console.error('Image upload failed:', err.message);
    res.status(502).json({ error: err.message || 'Image upload failed' });
  }
}

// POST upload bank logo image
router.post('/upload-bank-logo', receiveImage('logo'), (req, res) => {
  uploadLogo(req, res, 'bank-logos');
});

// POST upload delivery service logo image
router.post('/upload-delivery-logo', receiveImage('logo'), (req, res) => {
  uploadLogo(req, res, 'delivery-logos');
});

// POST upload banner image/gif media
router.post('/upload-banner-media', receiveImage('media'), (req, res) => {
  uploadLogo(req, res, 'products/banners');
});

router.get('/images', async (req, res) => {
  try {
    const skip = Math.max(0, Number.parseInt(req.query.skip, 10) || 0);
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 50));
    res.json(await listImages({ folder: req.query.folder, skip, limit }));
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not fetch hosted images' });
  }
});

router.get('/folders', async (req, res) => {
  try {
    res.json(await listFolders());
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not fetch hosted image folders' });
  }
});

module.exports = router;
