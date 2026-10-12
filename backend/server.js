const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GridFSBucket } = require('mongodb');
const productsRoute = require('./routes/products');
const salesRoute = require('./routes/sales');
const customersRoute = require('./routes/customers');
const categoriesRoute = require('./routes/categories');
const settingsRoute = require('./routes/settings');
const usersRoute = require('./routes/users');
const chatRoute = require('./routes/chat');
const productCommentsRoute = require('./routes/productComments');
const pushRoute = require('./routes/push');
const adminAuthRoute = require('./routes/adminAuth');
const Admin = require('./models/admin');
const { adminApiAuthorization } = require('./utils/adminAuth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 4000;

function redactMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  // Hide credentials in logs: mongodb://user:pass@host -> mongodb://***:***@host
  return uri.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://***:***@');
}

async function start() {
  console.log('Starting backend...');
  let mongoUri = process.env.MONGO_URI;
  let inMemoryServer;
  try {
    if (!mongoUri && process.env.USE_INMEM === '1') {
      // Try to start mongodb-memory-server
      try {
        console.log('Attempting to start mongodb-memory-server (in-memory)');
        const { MongoMemoryServer } = require('mongodb-memory-server');
        inMemoryServer = await MongoMemoryServer.create();
        mongoUri = inMemoryServer.getUri();
        console.log('Using in-memory MongoDB at', mongoUri);
      } catch (err) {
        console.warn('mongodb-memory-server not available, attempting local MongoDB', err && err.message);
      }
    }

    mongoUri = mongoUri || process.env.MONGO_URI || 'mongodb://localhost:27017/winandchit';
    const dbNameFromEnv = (process.env.MONGO_DB_NAME || '').trim();
    const connectOptions = {
      serverSelectionTimeoutMS: 12000
    };
    // Optional override only when explicitly provided.
    if (dbNameFromEnv) connectOptions.dbName = dbNameFromEnv;

    console.log('Connecting to MongoDB at', redactMongoUri(mongoUri));
    await mongoose.connect(mongoUri, connectOptions);
    console.log('Mongoose connected');
    await Admin.init();
    if (!process.env.ADMIN_JWT_SECRET && !process.env.JWT_SECRET) {
      console.warn('ADMIN_JWT_SECRET is not configured; using a host-local admin secret. Set a shared secret when running multiple backend instances.');
    }
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const legacyUsers = await usersCollection.find(
      { membershipTier: { $exists: true } },
      { projection: { _id: 1, membership: 1, membershipTier: 1 } }
    ).toArray();
    let migratedUsers = 0;
    for (const user of legacyUsers) {
      const membership = ['Standard', 'Silver', 'Gold'].includes(user.membership) && user.membership !== 'Standard'
        ? user.membership
        : ['Standard', 'Silver', 'Gold'].includes(user.membershipTier)
          ? user.membershipTier
          : ['Standard', 'Silver', 'Gold'].includes(user.membership)
            ? user.membership
            : 'Standard';
      const result = await usersCollection.updateOne(
        { _id: user._id },
        { $set: { membership }, $unset: { membershipTier: '' } }
      );
      migratedUsers += result.modifiedCount || result.nModified || 0;
    }
    if (migratedUsers > 0) {
      console.log(`Migrated ${migratedUsers} user membership record(s).`);
    }

    const retentionCleanup = () => {
      chatRoute.purgeExpiredMessages().catch(err => {
        console.error('Scheduled chat retention cleanup failed:', err);
      });
    };
    retentionCleanup();
    const retentionCleanupTimer = setInterval(retentionCleanup, 24 * 60 * 60 * 1000);
    retentionCleanupTimer.unref();

    // make GridFS bucket available via app locals only if enabled
    // This guards against accidental use of GridFS write middleware when external image hosting is enabled.
    if (process.env.ENABLE_GRIDFS === '1') {
      try {
        app.locals.gfsBucket = new GridFSBucket(db, { bucketName: 'images' });
      } catch (e) {
        console.warn('Failed to initialize GridFSBucket:', e && e.message);
      }
    }

    app.use('/api', adminApiAuthorization);
    app.use('/api/admin-auth', adminAuthRoute);
    app.use('/api/products', productsRoute);
    app.use('/api/sales', salesRoute);
    app.use('/api/customers', customersRoute);
    app.use('/api/categories', categoriesRoute);
    app.use('/api/settings', settingsRoute);
    app.use('/api/users', usersRoute);
    app.use('/api/chat', chatRoute);
    app.use('/api/product-comments', productCommentsRoute);
    app.use('/api/push', pushRoute);

    // Serve static assets (images, css, etc.) from the public folder
    // so endpoints that return HTML referencing `/assets/...` can load images.
    app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
    app.use(express.static(path.join(__dirname, 'public')));

    // Repair common double-extension mistake (e.g., watermark-logo.png.png -> watermark-logo.png)
    // This helps when users accidentally saved images with an extra .png extension.
    try {
      const backendAssets = path.join(__dirname, 'public', 'assets');
      if (fs.existsSync(backendAssets)) {
        for (const f of fs.readdirSync(backendAssets)) {
          if (/\.png\.png$/i.test(f)) {
            const from = path.join(backendAssets, f);
            const to = path.join(backendAssets, f.replace(/\.png\.png$/i, '.png'));
            try { fs.renameSync(from, to); console.log('Renamed', from, '->', to) } catch (e) { console.warn('Could not rename', from, e && e.message) }
          }
        }
      }

      // Also try to repair frontend public assets if present in the workspace
      const frontendAssets = path.join(__dirname, '..', 'frontend', 'public', 'assets');
      if (fs.existsSync(frontendAssets)) {
        for (const f of fs.readdirSync(frontendAssets)) {
          if (/\.png\.png$/i.test(f)) {
            const from = path.join(frontendAssets, f);
            const to = path.join(frontendAssets, f.replace(/\.png\.png$/i, '.png'));
            try { fs.renameSync(from, to); console.log('Renamed', from, '->', to) } catch (e) { console.warn('Could not rename', from, e && e.message) }
          }
        }
      }
    } catch (e) {
      console.warn('Asset repair pass failed:', e && e.message);
    }

    // simple health
    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

    app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
  } catch (err) {
    console.error('Failed to start server', err && err.stack ? err.stack : err);
    if (inMemoryServer) await inMemoryServer.stop();
    process.exit(1);
  }
}

start().catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});
