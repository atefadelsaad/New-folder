'use strict';
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('./db');

const USERS = [
  ['admin', 'admin123', 'admin', 'IT Manager'],
  ['head', 'head123', 'head', 'Technical Head'],
  ['area', 'area123', 'area', 'Area Manager'],
  ['store', 'store123', 'store', 'Warehouse Keeper'],
  ['senior', 'senior123', 'senior', 'Senior Technical'],
  ['junior', 'junior123', 'junior', 'Junior Technical']
];

// High-level groupings. Item types are added inside them from the الفئات screen.
const CATEGORIES = ['طابعات', 'كمبيوترات'];

const BRANCHES = [
  { name: 'فرع سموحة', gov: 'الإسكندرية' },
  { name: 'فرع العجمي', gov: 'الإسكندرية' },
  { name: 'فرع طنطا', gov: 'الغربية' }
];

async function ensureUsersSeed() {
  const pool = await getPool();
  const r = await pool.request().query('SELECT COUNT(*) AS c FROM users');
  if (r.recordset[0].c > 0) return;
  for (const [username, password, role, name] of USERS) {
    await pool.request()
      .input('u', sql.NVarChar(64), username)
      .input('p', sql.NVarChar(255), bcrypt.hashSync(password, 10))
      .input('r', sql.NVarChar(16), role)
      .input('n', sql.NVarChar(120), name)
      .query('INSERT INTO users (username, password_hash, role, name) VALUES (@u, @p, @r, @n)');
  }
}

async function ensureDomainSeed() {
  const pool = await getPool();
  const r = await pool.request().query('SELECT COUNT(*) AS c FROM categories');
  if (r.recordset[0].c > 0) return;

  for (const name of CATEGORIES) {
    await pool.request()
      .input('n', sql.NVarChar(120), name)
      .query('IF NOT EXISTS (SELECT 1 FROM categories WHERE name = @n) INSERT INTO categories (name, has_serial) VALUES (@n, 1)');
  }
  for (const b of BRANCHES) {
    await pool.request()
      .input('n', sql.NVarChar(160), b.name)
      .input('g', sql.NVarChar(80), b.gov)
      .query('INSERT INTO branches (name, gov, created_by) VALUES (@n, @g, N\'Warehouse Keeper\')');
  }
}

module.exports = { ensureUsersSeed, ensureDomainSeed };
