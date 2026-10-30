'use strict';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const store = require('./filestore');

// Resolve the project root both in local dev (cwd = server/) and in Docker (cwd = /app).
const ROOT = fs.existsSync(path.join(process.cwd(), 'it-warehouse_1.html'))
  ? process.cwd()
  : path.resolve(process.cwd(), '..');

// Take the daily snapshot before the state loader possibly rewrites the files.
store.backupNow();

const routes = require('./routes');

const app = express();
app.use(cors());
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '2mb' }));

// Build id derived from the UI and server sources, so any deployed change makes
// the 15-second client poll reload the page.
const SRC_DIR = path.join(__dirname);
const BUILD_FILES = (() => {
  const files = [path.join(ROOT, 'it-warehouse_1.html'), path.join(ROOT, 'server', 'package.json')];
  try {
    for (const name of fs.readdirSync(SRC_DIR)) {
      if (name.endsWith('.js')) files.push(path.join(SRC_DIR, name));
    }
  } catch (_) { /* ignore */ }
  return files;
})();

let buildCache = { key: null, hash: '' };

function buildId() {
  let key = '';
  for (const file of BUILD_FILES) {
    try {
      const s = fs.statSync(file);
      key += file + ':' + s.size + ':' + s.mtimeMs + '|';
    } catch (_) {
      key += file + ':-|';
    }
  }
  if (key === buildCache.key) return buildCache.hash;
  const hash = crypto.createHash('sha256');
  for (const file of BUILD_FILES) {
    hash.update(file);
    try { hash.update(fs.readFileSync(file)); } catch (_) { /* missing file */ }
  }
  buildCache = { key, hash: hash.digest('hex').slice(0, 16) };
  return buildCache.hash;
}

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ build: buildId() });
});

app.use('/api', routes);

// Serve the single-page UI (no other local assets are exposed).
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'it-warehouse_1.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ error: 'طلب غير صالح' });
  }
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'حجم الطلب كبير جدًا' });
  }
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`IT warehouse API listening on http://localhost:${PORT}`));
