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
      .query(`IF NOT EXISTS (SELECT 1 FROM branches WHERE LOWER(REPLACE(LTRIM(RTRIM(name)),' ',' ')) = LOWER(REPLACE(LTRIM(RTRIM(@n)),' ',' ')) AND gov = @g) INSERT INTO branches (name, gov, created_by) VALUES (@n, @g, N'Warehouse Keeper')`);
  }
}

async function ensureNoDuplicateBranches() {
  const pool = await getPool();
  const res = await pool.request().query('SELECT id, name, gov FROM branches ORDER BY id ASC');
  const branches = res.recordset;

  function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  const groups = {};
  for (const b of branches) {
    const key = norm(b.name) + '|' + norm(b.gov);
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }

  for (const [key, list] of Object.entries(groups)) {
    if (list.length <= 1) continue;
    const keep = list[0];
    const duplicates = list.slice(1);

    for (const dup of duplicates) {
      const tx = new sql.Transaction(pool);
      try {
        await tx.begin();

        const biDup = await new sql.Request(tx).input('dupId', sql.Int, dup.id).query('SELECT item_id, qty FROM branch_items WHERE branch_id = @dupId');
        for (const itemRow of biDup.recordset) {
          const biKeep = await new sql.Request(tx).input('keepId', sql.Int, keep.id).input('itemId', sql.Int, itemRow.item_id)
            .query('SELECT qty FROM branch_items WHERE branch_id = @keepId AND item_id = @itemId');
          if (biKeep.recordset.length > 0) {
            await new sql.Request(tx)
              .input('keepId', sql.Int, keep.id)
              .input('itemId', sql.Int, itemRow.item_id)
              .input('q', sql.Int, biKeep.recordset[0].qty + itemRow.qty)
              .query('UPDATE branch_items SET qty = @q WHERE branch_id = @keepId AND item_id = @itemId');
          } else {
            await new sql.Request(tx)
              .input('keepId', sql.Int, keep.id)
              .input('itemId', sql.Int, itemRow.item_id)
              .input('q', sql.Int, itemRow.qty)
              .query('INSERT INTO branch_items (branch_id, item_id, qty) VALUES (@keepId, @itemId, @q)');
          }
        }
        await new sql.Request(tx).input('dupId', sql.Int, dup.id).query('DELETE FROM branch_items WHERE branch_id = @dupId');

        await new sql.Request(tx).input('keepId', sql.Int, keep.id).input('dupId', sql.Int, dup.id)
          .query('UPDATE vouchers SET branch_id = @keepId WHERE branch_id = @dupId');

        await new sql.Request(tx).input('keepId', sql.Int, keep.id).input('dupId', sql.Int, dup.id)
          .query('UPDATE requests SET branch_id = @keepId WHERE branch_id = @dupId');

        await new sql.Request(tx).input('dupId', sql.Int, dup.id).query('DELETE FROM branches WHERE id = @dupId');

        await tx.commit();
      } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        console.error('Failed to deduplicate branch:', err);
      }
    }
  }
}

module.exports = { ensureUsersSeed, ensureDomainSeed, ensureNoDuplicateBranches };
