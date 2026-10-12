const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Admin = require('../models/admin');

const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;
const PERMISSIONS = new Set(['dashboard', 'pos', 'products', 'discounts', 'orders', 'settings', 'messages', 'comments']);

function loadTokenSecret() {
  const configuredSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (configuredSecret) return configuredSecret;

  const secretPath = path.join(__dirname, '..', '.admin-jwt-secret');
  try {
    const existingSecret = fs.readFileSync(secretPath, 'utf8').trim();
    if (existingSecret.length < 32) throw new Error('Stored admin token secret is invalid.');
    return existingSecret;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const generatedSecret = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(secretPath, generatedSecret, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return generatedSecret;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const existingSecret = fs.readFileSync(secretPath, 'utf8').trim();
    if (existingSecret.length < 32) throw new Error('Stored admin token secret is invalid.');
    return existingSecret;
  }
}

const TOKEN_SECRET = loadTokenSecret();

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(admin) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({
    sub: String(admin._id),
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS
  });
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getTokenPayload(token) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return null;

  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch (err) {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.sub || !Number.isFinite(decoded.exp) || decoded.exp <= Date.now() / 1000) return null;
    return decoded;
  } catch (err) {
    return null;
  }
}

function getRequiredPermission(req) {
  const path = req.path;
  const method = req.method.toUpperCase();

  if (path.startsWith('/admin-auth/')) {
    if (path === '/admin-auth/me') return 'authenticated';
    return path.startsWith('/admin-auth/admins') ? 'settings' : null;
  }

  if (path.startsWith('/products')) {
    if (method === 'GET' && (path === '/products' || /^\/products\/[a-f\d]{24}$/i.test(path) || path.startsWith('/products/images/'))) return null;
    if (method === 'POST' && (path === '/products/active-lookup' || path === '/products/virtual-tryon')) return null;
    return 'products';
  }

  if (path.startsWith('/categories')) {
    return ['GET', 'HEAD'].includes(method) && /^\/categories(?:\/[a-f\d]{24})?$/i.test(path)
      ? null
      : 'settings';
  }

  if (path.startsWith('/sales')) {
    if (path === '/sales/pending-order' || /^\/sales\/customer\/[^/]+$/.test(path)) return null;
    if (path.startsWith('/sales/report/')) return 'dashboard';
    if (path === '/sales/checkout') return 'pos';
    if (/^\/sales\/[^/]+\/receipt(?:\.pdf)?$/.test(path)) return ['orders', 'pos'];
    if (path === '/sales' && method === 'GET') return ['dashboard', 'orders'];
    return 'orders';
  }

  if (path.startsWith('/users')) {
    if (path === '/users/login' || path === '/users/register' || /^\/users\/[^/]+\/profile$/.test(path)) return null;
    return 'settings';
  }

  if (path.startsWith('/settings')) {
    return method === 'GET' && path === '/settings' ? null : 'settings';
  }

  if (path.startsWith('/customers')) return 'pos';

  if (path.startsWith('/chat')) {
    if (['/chat/visitor', '/chat/conversation', '/chat/migrate-guest', '/chat/customer-unread', '/chat/upload-photo'].includes(path) ||
      path.startsWith('/chat/events/')) return null;
    if (path.startsWith('/chat/messages/')) {
      return req.query.viewer === 'admin' ? 'messages' : null;
    }
    if (path === '/chat/messages' && method === 'POST' && req.body?.sender !== 'admin') return null;
    return 'messages';
  }

  if (path.startsWith('/product-comments')) {
    if (path === '/product-comments' && method === 'POST') return null;
    if (path === '/product-comments' && method === 'GET' && mongoose.isValidObjectId(req.query.productId)) return null;
    if (method === 'POST' && (path === '/product-comments/notifications' || path === '/product-comments/notifications/read')) return null;
    if (method === 'POST' && /^\/product-comments\/[^/]+\/customer-replies$/.test(path)) return null;
    return 'comments';
  }

  return null;
}

function sendUnauthorized(res, status, error) {
  return res.status(status).json({ error });
}

async function adminApiAuthorization(req, res, next) {
  try {
    const requiredPermission = getRequiredPermission(req);
    if (!requiredPermission) return next();

    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const payload = match && getTokenPayload(match[1]);
    if (!payload) return sendUnauthorized(res, 401, 'Admin login required');

    const admin = await Admin.findById(payload.sub).select('username permissions isOwner isActive');
    if (!admin || !admin.isActive) return sendUnauthorized(res, 401, 'Admin account is inactive or no longer exists');

    if (requiredPermission === 'authenticated') {
      req.admin = admin;
      return next();
    }

    if (requiredPermission !== 'settings' || !req.path.startsWith('/admin-auth/admins')) {
      const requiredPermissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
      if (!admin.isOwner && !requiredPermissions.some(permission => admin.permissions.includes(permission))) {
        return sendUnauthorized(res, 403, 'You do not have permission to perform this action');
      }
    } else if (!admin.isOwner) {
      return sendUnauthorized(res, 403, 'Only the owner can manage admin accounts');
    }

    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

function validatePermissions(permissions) {
  return Array.isArray(permissions) &&
    permissions.every(permission => typeof permission === 'string' && PERMISSIONS.has(permission));
}

module.exports = {
  TOKEN_LIFETIME_SECONDS,
  createToken,
  adminApiAuthorization,
  getRequiredPermission,
  validatePermissions
};
