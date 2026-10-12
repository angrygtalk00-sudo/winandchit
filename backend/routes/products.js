const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { randomUUID } = require('crypto');
const WebSocket = require('ws');
const sharp = require('sharp');
const Product = require('../models/product');
const ProductComment = require('../models/productComment');
const { autoExpirePromotions } = require('../utils/promotion');
const { uploadImage, deleteImages } = require('../utils/imageHost');

const router = express.Router();
const RUNWARE_WS_ENDPOINT = 'wss://ws-api.runware.ai/v1';
const RUNWARE_HTTP_ENDPOINT = 'https://api.runware.ai/v1';
// "P-Image-Try-On" is the dashboard display name; Runware's API requires this AIR identifier.
const RUNWARE_MODEL_ID = 'prunaai:p-image@try-on';
const RUNWARE_API_KEY = (process.env.RUNWARE_API_KEY || '').trim();
const PRIMARY_LOGO_PATH = path.join(__dirname, '..', 'public', 'assets', 'winandchit-logo.png');
const WATERMARK_SEAL_PATH = path.join(__dirname, '..', 'public', 'assets', 'watermark-logo.png');

function extractRunwareImage(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = extractRunwareImage(item);
      if (found) return found;
    }
    return '';
  }

  const direct = data.imageURL || data.imageUrl || data.imageDataURI || data.url || data.generatedImage || data.outputImage;
  if (typeof direct === 'string' && direct) return direct;
  const base64 = data.imageBase64Data || data.base64Image || data.imageData;
  if (typeof base64 === 'string' && base64) return `data:image/png;base64,${base64}`;

  for (const key of ['data', 'images', 'results', 'output']) {
    if (data[key]) {
      const found = extractRunwareImage(data[key]);
      if (found) return found;
    }
  }
  return '';
}

function collectRunwareErrors(data, taskUUID) {
  if (!data) return [];
  if (Array.isArray(data)) return data.flatMap(item => collectRunwareErrors(item, taskUUID));
  if (typeof data !== 'object') return [];

  const scopedToTask = !taskUUID || data.taskUUID === taskUUID || data.taskUUID === undefined;
  if (!scopedToTask) return [];

  const message = data.errorMessage || data.message || data.error;
  if (message && (data.error || data.status === 'failed' || data.success === false)) {
    return [String(message)];
  }
  return [];
}

function isRunwareImage(value) {
  return /^https?:\/\/\S+$/i.test(value)
    || /^data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]+$/.test(value);
}

function createRunwareTryOnTask(userImage, garmentImage) {
  return {
    taskType: 'imageInference',
    taskUUID: randomUUID(),
    model: RUNWARE_MODEL_ID,
    inputs: {
      referenceImages: [
        { image: userImage, role: 'person' },
        { image: garmentImage, role: 'garment' }
      ]
    },
    deliveryMethod: 'sync',
    outputType: 'URL',
    outputFormat: 'JPG',
    numberResults: 1
  };
}

function runRunwareTryOnWs({ userImage, garmentImage, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const task = createRunwareTryOnTask(userImage, garmentImage);
    const { taskUUID } = task;
    const ws = new WebSocket(RUNWARE_WS_ENDPOINT);
    let done = false;
    let authenticated = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws.close(); } catch (err) {}
      reject(new Error('Runware did not return a preview before the request timed out'));
    }, timeoutMs);

    const finish = (err, image) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch (closeErr) {}
      if (err) return reject(err);
      return resolve(image);
    };

    ws.on('open', () => {
      const authTask = [{ taskType: 'authentication', apiKey: RUNWARE_API_KEY }];
      ws.send(JSON.stringify(authTask));
    });

    ws.on('message', raw => {
      let payload = null;
      try {
        payload = JSON.parse(String(raw));
      } catch (err) {
        return;
      }

      const entries = Array.isArray(payload) ? payload : [payload];
      const authError = entries.find(item => item && item.taskType === 'authentication' && (item.success === false || item.error));
      if (authError) {
        return finish(new Error(String(authError.errorMessage || authError.message || authError.error || 'Runware authentication failed')));
      }

      const authOk = entries.some(item => item && item.taskType === 'authentication' && item.success !== false && !item.error);

      if (authOk && !authenticated) {
        authenticated = true;
        ws.send(JSON.stringify([task]));
      }

      for (const item of entries) {
        if (!item || typeof item !== 'object') continue;
        if (item.taskType === 'imageInference' && item.taskUUID === taskUUID) {
          const inferredImage = extractRunwareImage(item);
          if (inferredImage) return finish(null, inferredImage);
          const itemError = item.errorMessage || item.message || item.error;
          if (itemError && item.status !== 'pending' && item.success !== true) {
            return finish(new Error(String(itemError)));
          }
        }
        if (item.taskType === 'error' || item.error) {
          const itemError = item.errorMessage || item.message || item.error;
          if (itemError) return finish(new Error(String(itemError)));
        }
      }

      const image = extractRunwareImage(payload);
      if (image) return finish(null, image);

      const errors = collectRunwareErrors(payload, taskUUID);
      if (errors.length > 0) return finish(new Error(errors[0]));
    });

    ws.on('error', err => {
      finish(new Error(err.message || 'Runware WebSocket error'));
    });

    ws.on('close', (code, reasonBuffer) => {
      if (done) return;
      const reason = reasonBuffer ? String(reasonBuffer) : '';
      finish(new Error(`Runware WebSocket closed before image generation (code=${code}${reason ? `, reason=${reason}` : ''})`));
    });
  });
}

function getRunwareError(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      const message = getRunwareError(item);
      if (message) return message;
    }
    return '';
  }

  if (!data || typeof data !== 'object') return '';
  const message = data.errorMessage || data.message || data.error;
  if (message) return String(message);
  for (const key of ['data', 'errors', 'results', 'output']) {
    const nestedMessage = getRunwareError(data[key]);
    if (nestedMessage) return nestedMessage;
  }
  return '';
}

async function runRunwareTryOnHttp({ userImage, garmentImage, timeoutMs = 120000 }) {
  const task = createRunwareTryOnTask(userImage, garmentImage);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(RUNWARE_HTTP_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RUNWARE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([task]),
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    const providerError = getRunwareError(body);

    if (!response.ok) {
      throw new Error(`Runware HTTP request failed (${response.status})${providerError ? `: ${providerError}` : ''}`);
    }

    const image = extractRunwareImage(body);
    if (image) return image;
    throw new Error(providerError || 'Runware HTTP response did not include a generated image');
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Runware HTTP request timed out before image generation completed');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getGeneratedImageBuffer(image) {
  if (image.startsWith('data:image/')) {
    const match = image.match(/^data:image\/[a-zA-Z]+;base64,([a-zA-Z0-9+/=]+)$/);
    if (!match) throw new Error('Runware returned an invalid image data URI');
    return Buffer.from(match[1], 'base64');
  }

  const response = await fetch(image);
  if (!response.ok) throw new Error(`Could not download generated image (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function watermarkGeneratedImage(image) {
  if (!fs.existsSync(PRIMARY_LOGO_PATH) || !fs.existsSync(WATERMARK_SEAL_PATH)) {
    throw new Error('Virtual try-on watermark logo assets are missing');
  }

  const generatedBuffer = await getGeneratedImageBuffer(image);
  const normalizedImage = await sharp(generatedBuffer).rotate().jpeg({ quality: 92 }).toBuffer();
  const metadata = await sharp(normalizedImage).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;
  if (!imageWidth || !imageHeight) throw new Error('Could not read generated image dimensions');

  const primaryLogoWidth = Math.max(68, Math.min(Math.round(imageWidth * 0.14), 180));
  const primaryLogo = await sharp(PRIMARY_LOGO_PATH)
    .resize({ width: primaryLogoWidth, withoutEnlargement: true })
    .png()
    .toBuffer();
  const primaryLogoMetadata = await sharp(primaryLogo).metadata();
  const sealWidth = Math.max(76, Math.min(Math.round(imageWidth * 0.16), 200));
  const seal = await sharp(WATERMARK_SEAL_PATH)
    .resize({ width: sealWidth, withoutEnlargement: true })
    .png()
    .toBuffer();
  const sealMetadata = await sharp(seal).metadata();
  const padding = Math.max(10, Math.round(imageWidth * 0.018));
  const primaryLeft = Math.max(padding, Math.round((imageWidth - (primaryLogoMetadata.width || primaryLogoWidth)) / 2));
  const sealLeft = Math.max(padding, imageWidth - (sealMetadata.width || sealWidth) - padding);
  const sealTop = Math.max(padding, imageHeight - (sealMetadata.height || sealWidth) - padding);
  const output = await sharp(normalizedImage)
    .composite([
      { input: primaryLogo, left: primaryLeft, top: padding },
      { input: seal, left: sealLeft, top: sealTop }
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return `data:image/jpeg;base64,${output.toString('base64')}`;
}

function setNoStore(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
}

function normalizeVideoUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeCatalogProduct(product) {
  const promotion = product.promotion && typeof product.promotion === 'object' && !Array.isArray(product.promotion)
    ? product.promotion
    : {};

  return {
    ...product,
    images: Array.isArray(product.images) ? product.images.filter(image => typeof image === 'string') : [],
    videoUrl: typeof product.videoUrl === 'string' ? product.videoUrl : (typeof product.youtubeUrl === 'string' ? product.youtubeUrl : ''),
    youtubeUrl: typeof product.youtubeUrl === 'string' ? product.youtubeUrl : (typeof product.videoUrl === 'string' ? product.videoUrl : ''),
    variants: Array.isArray(product.variants)
      ? product.variants
        .filter(variant => variant && typeof variant === 'object' && !Array.isArray(variant))
        .map(variant => ({
          ...variant,
          sku: typeof variant.sku === 'string' ? variant.sku : '',
          color: typeof variant.color === 'string' ? variant.color : '',
          size: typeof variant.size === 'string' ? variant.size : '',
          attributes: variant.attributes && typeof variant.attributes === 'object' && !Array.isArray(variant.attributes)
            ? variant.attributes
            : {},
          price: Number.isFinite(Number(variant.price)) ? Number(variant.price) : 0,
          stock: Number.isFinite(Number(variant.stock)) ? Number(variant.stock) : 0,
          image: typeof variant.image === 'string' ? variant.image : ''
        }))
      : [],
    virtualTryOnEnabled: product.virtualTryOnEnabled !== false,
    promotion: {
      enabled: Boolean(promotion.enabled),
      title: typeof promotion.title === 'string' ? promotion.title : '',
      discountPercentage: Number.isFinite(Number(promotion.discountPercentage)) ? Number(promotion.discountPercentage) : 0,
      limitType: promotion.limitType === 'quantity' ? 'quantity' : 'time',
      startDate: promotion.startDate || null,
      endDate: promotion.endDate || null,
      limitCount: Number.isFinite(Number(promotion.limitCount)) ? Number(promotion.limitCount) : 0,
      soldCount: Number.isFinite(Number(promotion.soldCount)) ? Number(promotion.soldCount) : 0,
      minQty: Number.isFinite(Number(promotion.minQty)) ? Number(promotion.minQty) : 0,
      variantSku: typeof promotion.variantSku === 'string' ? promotion.variantSku : ''
    }
  };
}

// Configure multer with memory storage (10MB max per image).
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    const allowed = allowedTypes.includes(file.mimetype);
    callback(allowed ? null : new Error('Only JPEG, PNG, GIF, WebP, and SVG images are allowed'), allowed);
  }
});

function receiveProductImages(req, res, next) {
  upload.array('images', 30)(req, res, err => {
    if (!err) return next();
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.message || 'Invalid image upload' });
  });
}

// Upload image(s) and return hosted URLs in the existing client response shape.
router.post('/upload', receiveProductImages, async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.json({ uploaded: [] });
    }

    // Upload all files concurrently and capture per-file results
    const uploadPromises = files.map((file) => uploadImage({
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
      folder: 'products'
    }).then(result => ({ url: result.url })).catch(err => ({ error: err.message || String(err) })));
    const results = await Promise.all(uploadPromises)

    const uploaded = results.map(r => (r.url || null))
    const errors = results.map((r, idx) => (r.error ? { index: idx, file: files[idx]?.originalname || '<unknown>', error: r.error } : null)).filter(Boolean)

    if (errors.length > 0) {
      return res.status(502).json({ error: 'One or more images failed to upload', uploaded, errors });
    }

    if (uploaded.every(u => !u)) {
      return res.status(502).json({ error: 'All uploads failed', errors });
    }

    res.status(201).json({ uploaded, errors });
  } catch (err) {
    console.error('Image upload error:', err.message);
    res.status(502).json({ error: err.message || 'Image upload failed' });
  }
});

router.post('/virtual-tryon', async (req, res) => {
  try {
    const userImage = String(req.body?.userImage || '').trim();
    const garmentImage = String(req.body?.garmentImage || '').trim();

    if (!RUNWARE_API_KEY) {
      console.error('Virtual try-on is unavailable: RUNWARE_API_KEY is not configured');
      return res.status(503).json({ error: 'Virtual try-on is temporarily unavailable because Runware is not configured' });
    }
    if (!userImage || !garmentImage) return res.status(400).json({ error: 'Both user image and garment image are required' });
    if (!isRunwareImage(userImage) || !isRunwareImage(garmentImage)) {
      return res.status(400).json({ error: 'Images must be HTTPS URLs or base64-encoded image data URLs' });
    }

    let generatedImage;
    try {
      generatedImage = await runRunwareTryOnWs({ userImage, garmentImage });
    } catch (webSocketError) {
      console.warn('Runware WebSocket try-on failed; falling back to HTTPS:', webSocketError.message);
    }

    if (!generatedImage) {
      generatedImage = await runRunwareTryOnHttp({ userImage, garmentImage });
    }
    const protectedImage = await watermarkGeneratedImage(generatedImage);
    return res.json({ image: protectedImage });
  } catch (err) {
    const message = err && err.message ? err.message : 'Could not generate virtual try-on image';
    console.error('Virtual try-on error stack:', err && err.stack ? err.stack : err);
    res.status(502).json({ error: message });
  }
});

// Backward-compatibility: Stream image from GridFS by id if legacy ObjectId exists
router.get('/images/:id', async (req, res) => {
  const gfsBucket = req.app.locals.gfsBucket;
  if (!gfsBucket) return res.status(404).json({ error: 'GridFS not initialized' });
  try {
    const _id = new mongoose.Types.ObjectId(req.params.id);
    const download = gfsBucket.openDownloadStream(_id);
    download.on('error', (err) => res.status(404).json({ error: 'Not found' }));
    download.pipe(res);
  } catch (e) {
    res.status(400).json({ error: 'invalid id' });
  }
});

// Get next sequential SKU (e.g. WC-0001, WC-0002)
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const rawYoutubeUrl = body.youtubeUrl !== undefined ? body.youtubeUrl : body.videoUrl;
    const product = new Product({
      ...body,
      youtubeUrl: normalizeVideoUrl(rawYoutubeUrl),
      videoUrl: normalizeVideoUrl(rawYoutubeUrl)
    });
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  setNoStore(res);
  try {
    try {
      await autoExpirePromotions(Product);
    } catch (promoErr) {
      console.warn('Non-fatal error expiring promotions during product list:', promoErr.message);
    }

    const query = { isDeleted: { $ne: true } };
    if (req.query.category && req.query.category !== 'All') {
      query.category = req.query.category;
    }

    if (req.query.startDateTime || req.query.endDateTime) {
      query.entryDate = {};
      if (req.query.startDateTime) {
        const start = new Date(req.query.startDateTime);
        if (!Number.isNaN(start.getTime())) query.entryDate.$gte = start;
      }
      if (req.query.endDateTime) {
        const end = new Date(req.query.endDateTime);
        if (!Number.isNaN(end.getTime())) query.entryDate.$lte = end;
      }
      if (Object.keys(query.entryDate).length === 0) delete query.entryDate;
    }

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), 500);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const products = await Product.find(query)
      .sort({ entryDate: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    res.json(products.map(normalizeCatalogProduct));
  } catch (err) {
    console.error('Product list error:', err && err.stack ? err.stack : err);
    res.status(500).json({
      error: 'Could not load products',
      details: process.env.NODE_ENV !== 'production' ? (err && err.stack ? err.stack : String(err)) : undefined
    });
  }
});

router.get('/next-sku', async (req, res) => {
  try {
    const products = await Product.find({}, { 'variants.sku': 1 }).lean();
    let maxNum = 0;
    for (const p of products) {
      if (p.variants && Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (v.sku) {
            const match = v.sku.match(/WC-(\d+)/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          }
        }
      }
    }
    const nextNum = maxNum + 1;
    const nextSku = `WC-${String(nextNum).padStart(4, '0')}`;
    res.json({ nextSku, nextNumber: nextNum });
  } catch (err) {
    res.json({ nextSku: 'WC-0001', nextNumber: 1 });
  }
});

router.post('/active-lookup', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map(id => String(id)).filter(mongoose.Types.ObjectId.isValid))].slice(0, 2000)
      : [];
    if (ids.length === 0) return res.json([]);

    const products = await Product.find({
      _id: { $in: ids },
      isDeleted: { $ne: true }
    }).lean();
    res.json(products.map(normalizeCatalogProduct));
  } catch (err) {
    console.error('Active product lookup error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Could not verify cached products' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    await autoExpirePromotions(Product);
    const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(normalizeCatalogProduct(product));
  } catch (err) {
    console.error(`Get product ${id} error stack:`, err && err.stack ? err.stack : err);
    res.status(500).json({
      error: 'Could not load product',
      details: process.env.NODE_ENV !== 'production' ? (err && err.stack ? err.stack : String(err)) : undefined
    });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const previousImageUrls = [
      ...(product.images || []),
      ...(product.variants || []).map(variant => variant.image)
    ].filter(Boolean);

    if (req.body.promotion !== undefined) {
      if (!req.body.promotion || req.body.promotion === false) {
        product.promotion = {
          enabled: false,
          title: '',
          discountPercentage: 0,
          startDate: null,
          endDate: null,
          limitType: 'time',
          limitCount: 0,
          soldCount: 0,
          minQty: 0,
          variantSku: ''
        };
      } else {
        const p = req.body.promotion;
        product.promotion = {
          enabled: Boolean(p.enabled),
          title: p.title || '',
          discountPercentage: Number(p.discountPercentage) || 0,
          startDate: p.startDate ? new Date(p.startDate) : null,
          endDate: p.endDate ? new Date(p.endDate) : null,
          limitType: p.limitType || 'time',
          limitCount: Number(p.limitCount) || 0,
          soldCount: Number(p.soldCount) || 0,
          minQty: Number(p.minQty) || 0,
          variantSku: p.variantSku || ''
        };
      }
      product.markModified('promotion');
    }

    if (req.body.title !== undefined) product.title = req.body.title;
    if (req.body.description !== undefined) product.description = req.body.description;
    if (req.body.category !== undefined) product.category = req.body.category;
    if (req.body.subCategory !== undefined) product.subCategory = req.body.subCategory;
    if (req.body.variants !== undefined) product.variants = req.body.variants;
    if (req.body.images !== undefined) product.images = req.body.images;
    if (req.body.videoUrl !== undefined || req.body.youtubeUrl !== undefined) {
      const incomingYoutubeUrl = req.body.youtubeUrl !== undefined ? req.body.youtubeUrl : req.body.videoUrl;
      const normalizedYoutubeUrl = typeof incomingYoutubeUrl === 'string' ? incomingYoutubeUrl.trim() : '';
      product.youtubeUrl = normalizedYoutubeUrl;
      product.videoUrl = normalizedYoutubeUrl;
    }
    if (req.body.tags !== undefined) product.tags = req.body.tags;
    if (req.body.virtualTryOnEnabled !== undefined) product.virtualTryOnEnabled = Boolean(req.body.virtualTryOnEnabled);

    await product.save();
    const remainingImageUrls = new Set([
      ...(product.images || []),
      ...(product.variants || []).map(variant => variant.image)
    ].filter(Boolean));
    const removedImageUrls = [...new Set(previousImageUrls)].filter(url => !remainingImageUrls.has(url));
    const cleanupResults = await deleteImages(removedImageUrls);
    const cleanupFailures = cleanupResults.filter(result => result.error);
    if (cleanupFailures.length) console.error('Removed product image cleanup failed:', cleanupFailures);
    res.json({ ...product.toObject(), imageCleanupFailures: cleanupFailures.length });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(400).json({ error: err.message });
  }
});

// This route creates a backup snapshot before marking product as deleted.
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const wasAlreadyDeleted = Boolean(product.isDeleted);
    const imageUrls = wasAlreadyDeleted ? [] : [...new Set([
      ...(product.images || []),
      ...(product.variants || []).map(variant => variant.image)
    ].filter(Boolean))];

    if (!wasAlreadyDeleted) {
      // Preserve product and sales metadata while removing media references.
      // Create backup snapshot prior to mutation.
      try {
        const Backup = require('../models/backup');
        const snapshot = product.toObject();
        snapshot.images = [];
        snapshot.variants = (snapshot.variants || []).map(variant => ({ ...variant, image: '' }));
        await Backup.create({ collectionName: 'products', operation: 'delete', snapshot, docIds: [String(product._id)] });
      } catch (e) {
        console.warn('Product backup failed:', e && e.message);
      }

      product.isDeleted = true;
      product.deletedAt = new Date();
      product.images = [];
      product.variants = (product.variants || []).map(variant => ({ ...variant.toObject?.() || variant, image: '' }));
      await product.save();
    }

    const commentCleanup = await ProductComment.deleteMany({ productId: product._id });
    const cleanupResults = await deleteImages(imageUrls);
    const cleanupFailures = cleanupResults.filter(result => result.error);
    if (cleanupFailures.length) console.error('Archived product image cleanup failed:', cleanupFailures);

    res.json({
      success: true,
      message: cleanupFailures.length
        ? 'Product archived, but some hosted images could not be deleted'
        : 'Product archived and hosted images deleted',
      imageCleanupFailures: cleanupFailures.length,
      deletedComments: commentCleanup.deletedCount,
      id: product._id
    });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Admin backup endpoints (basic, protected by env flag)
router.get('/_backups/list', async (req, res) => {
  try {
    if (process.env.ALLOW_BACKUP_ROUTES !== '1') return res.status(404).json({ error: 'Not found' })
    const Backup = require('../models/backup')
    const list = await Backup.find().sort({ createdAt: -1 }).limit(200).lean()
    res.json(list)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/_backups/restore', async (req, res) => {
  try {
    if (process.env.ALLOW_BACKUP_ROUTES !== '1') return res.status(404).json({ error: 'Not found' })
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    const Backup = require('../models/backup')
    const b = await Backup.findById(id).lean()
    if (!b) return res.status(404).json({ error: 'backup not found' })
    if (b.collectionName !== 'products') return res.status(400).json({ error: 'invalid collection for this route' })
    // restore snapshot into products collection (insert as new doc if missing or overwrite)
    const snapshot = b.snapshot
    if (!snapshot || !snapshot._id) return res.status(400).json({ error: 'invalid snapshot' })
    const existing = await Product.findById(snapshot._id)
    if (existing) {
      // restore fields
      Object.assign(existing, snapshot)
      await existing.save()
      return res.json({ restored: true, id: existing._id })
    } else {
      // insert new document
      const np = new Product(snapshot)
      await np.save()
      return res.json({ restored: true, id: np._id })
    }
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router;
