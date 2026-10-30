'use strict';

// JSON file storage for the whole application. Every collection lives in a
// JSON document under <project>/data; writes go through a temp file plus an
// atomic rename, and a small in-process lock serialises mutations so two
// requests can never interleave a read-modify-write cycle.
const fs = require('fs');
const path = require('path');

// In local dev this file lives in <project>/server/src, while the Docker image
// copies it to /app/src. Detect the project root by looking for the UI file one
// level up first, then fall back to two levels up.
const ROOT = fs.existsSync(path.join(__dirname, '..', 'it-warehouse_1.html'))
  ? path.resolve(__dirname, '..')
  : path.resolve(__dirname, '..', '..');
// Tests can point the API at an isolated directory (WH_DATA_DIR) without
// touching the production files.
const DATA_DIR = process.env.WH_DATA_DIR ? path.resolve(process.env.WH_DATA_DIR) : path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_KEEP = 14;
const DATA_FILES = ['warehouse.json', 'maintenance_forms.json', 'dispatch_meta.json', 'audit_log.json'];

let tmpSeq = 0;

function fileFor(name) {
  return path.join(DATA_DIR, name);
}

function ensureDir(dir) {
  fs.mkdirSync(dir || DATA_DIR, { recursive: true });
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function readJson(name, fallback) {
  const file = fileFor(name);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return clone(fallback);
    throw err;
  }
  if (!raw.trim()) return clone(fallback);
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Keep the unreadable file for inspection instead of silently deleting it.
    try { fs.renameSync(file, file + '.corrupt-' + Date.now()); } catch (_) {}
    console.error('[filestore] ' + name + ' is not valid JSON, using defaults:', err.message);
    return clone(fallback);
  }
}

function writeJsonAtomic(name, value) {
  ensureDir();
  const file = fileFor(name);
  const tmp = file + '.' + process.pid + '.' + (tmpSeq++) + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// Synchronous critical section: the callback must not await anything. This is
// the in-process write queue/lock that protects the JSON documents. Nested
// calls are allowed because they happen on the same synchronous stack.
let lockDepth = 0;

function withLock(fn) {
  if (lockDepth > 0) return fn();
  lockDepth++;
  try {
    return fn();
  } finally {
    lockDepth--;
  }
}

function writeJson(name, value) {
  return withLock(() => writeJsonAtomic(name, value));
}

function readList(name) {
  const rows = readJson(name, []);
  return Array.isArray(rows) ? rows : [];
}

function readMap(name) {
  const rows = readJson(name, {});
  return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
}

// One snapshot per day, keeping the newest 14 days.
function backupNow(date) {
  const stamp = (date ? new Date(date) : new Date()).toISOString().slice(0, 10);
  ensureDir(BACKUP_DIR);
  const dir = path.join(BACKUP_DIR, stamp);
  if (fs.existsSync(dir)) {
    const already = fs.readdirSync(dir).filter((n) => DATA_FILES.includes(n));
    if (already.length === DATA_FILES.length) return dir;
  }
  ensureDir(dir);
  for (const name of DATA_FILES) {
    const src = fileFor(name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, name));
  }
  pruneBackups();
  return dir;
}

function pruneBackups() {
  let dirs;
  try {
    dirs = fs.readdirSync(BACKUP_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  } catch (_) {
    return;
  }
  while (dirs.length > BACKUP_KEEP) {
    const old = dirs.shift();
    try { fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  readJson,
  writeJson,
  readList,
  readMap,
  writeList: writeJson,
  writeMap: writeJson,
  withLock,
  backupNow,
  DATA_DIR,
  DATA_FILES
};
