'use strict';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { pool } = require('./db');
const routes = require('./routes');
const { ensureUsersSeed, ensureDomainSeed } = require('./seed');

// Resolve the project root both in local dev (cwd = server/) and in Docker (cwd = /app).
const ROOT = fs.existsSync(path.join(process.cwd(), 'db', 'schema.sql'))
  ? process.cwd()
  : path.resolve(process.cwd(), '..');

async function init() {
  const schema = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  await ensureUsersSeed();
  await ensureDomainSeed();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', routes);

// Serve the single-page UI (no other local assets are exposed).
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'it-warehouse_1.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
});

const PORT = process.env.PORT || 3000;

init()
  .then(() => app.listen(PORT, () => console.log(`IT warehouse API listening on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
