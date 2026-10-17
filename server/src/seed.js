'use strict';
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

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
  const { rows } = await pool.query('SELECT count(*)::int AS c FROM users');
  if (rows[0].c > 0) return;
  for (const [username, password, role, name] of USERS) {
    await pool.query(
      'INSERT INTO users (username, password_hash, role, name) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO NOTHING',
      [username, bcrypt.hashSync(password, 10), role, name]
    );
  }
}

async function ensureDomainSeed() {
  const { rows } = await pool.query('SELECT count(*)::int AS c FROM categories');
  if (rows[0].c > 0) return;

  for (const name of CATEGORIES) {
    await pool.query('INSERT INTO categories (name, has_serial) VALUES ($1, TRUE) ON CONFLICT (name) DO NOTHING', [name]);
  }
  for (const b of BRANCHES) {
    await pool.query('INSERT INTO branches (name, gov, created_by) VALUES ($1,$2,$3)', [b.name, b.gov, 'Warehouse Keeper']);
  }
}

module.exports = { ensureUsersSeed, ensureDomainSeed };
