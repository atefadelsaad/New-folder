'use strict';

// Small JSON file store for the new form records. The rest of the app keeps
// inventory/vouchers in SQL Server; these helpers only cover the maintenance
// forms and the extra printable metadata for dispatch permits.
const fs = require('fs');
const path = require('path');

// In local dev this file lives in <project>/server/src, while the Docker image
// copies it to /app/src. Detect the project root by looking for the db folder
// one level up first, then fall back to two levels up.
const ROOT = fs.existsSync(path.join(__dirname, '..', 'db'))
  ? path.resolve(__dirname, '..')
  : path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

function fileFor(name) {
  return path.join(DATA_DIR, name);
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(name, fallback) {
  const file = fileFor(name);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function writeJson(name, value) {
  ensureDir();
  const file = fileFor(name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readList(name) {
  const rows = readJson(name, []);
  return Array.isArray(rows) ? rows : [];
}

function readMap(name) {
  const rows = readJson(name, {});
  return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
}

module.exports = { readJson, writeJson, readList, writeJsonList: writeJson, readMap, writeMap: writeJson, DATA_DIR };
