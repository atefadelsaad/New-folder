'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./filestore');

const PHOTO_DIR = path.join(DATA_DIR, 'inspection_photos');
const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};
const MAX_BYTES = 1024 * 1024;
const DATA_URI = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function write(dataUri) {
  const match = DATA_URI.exec(String(dataUri || ''));
  if (!match) throw new Error('صورة غير صالحة؛ استخدم JPG أو PNG أو WebP');
  const contentType = match[1];
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString('base64') !== match[2]) {
    throw new Error('حجم الصورة يجب ألا يتجاوز 1 ميجابايت');
  }
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  const id = crypto.randomUUID() + '.' + TYPES[contentType];
  const file = path.join(PHOTO_DIR, id);
  const temp = file + '.' + process.pid + '.tmp';
  const fd = fs.openSync(temp, 'wx');
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (err) {
    fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch (_) {}
    throw err;
  }
  fs.closeSync(fd);
  try {
    fs.renameSync(temp, file);
  } catch (err) {
    try { fs.unlinkSync(temp); } catch (_) {}
    throw err;
  }
  return { id, contentType };
}

function remove(id) {
  const file = resolve(id);
  if (file && fs.existsSync(file)) fs.unlinkSync(file);
}

function resolve(id) {
  const name = String(id || '');
  if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(name)) return null;
  return path.join(PHOTO_DIR, name);
}

module.exports = { write, remove, resolve, MAX_BYTES };
