'use strict';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { getPool, ensureDatabase } = require('./db');
const routes = require('./routes');
const { ensureUsersSeed, ensureDomainSeed } = require('./seed');

// Resolve the project root both in local dev (cwd = server/) and in Docker (cwd = /app).
const ROOT = fs.existsSync(path.join(process.cwd(), 'db', 'schema.mssql.sql'))
  ? process.cwd()
  : path.resolve(process.cwd(), '..');

// SQL Server needs each GO-separated batch executed on its own.
async function runSchema() {
  const schema = fs.readFileSync(path.join(ROOT, 'db', 'schema.mssql.sql'), 'utf8');
  const batches = schema.split(/^\s*GO\s*$/im).map((s) => s.trim()).filter(Boolean);
  const pool = await getPool();
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
}

async function init() {
  await ensureDatabase();
  await runSchema();
  await ensureUsersSeed();
  await ensureDomainSeed();
}

const app = express();
app.use(cors());
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
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
