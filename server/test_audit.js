'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-audit-'));
process.env.WH_DATA_DIR = dataDir;

try {
  const data = require('./src/data');
  const category = { id: null };
  const record = (method, action, reason, mutate) => data.withAudit({
    method,
    action,
    path: '/api/categories',
    actor: 'Test User',
    username: 'test',
    role: 'admin',
    reason
  }, () => data.tx(mutate));

  record('POST', 'إضافة', '', (state) => {
    category.id = ++state.counters.category;
    state.categories.push({ id: category.id, name: 'Audit test category' });
  });
  record('PUT', 'تعديل', 'تحديث الاسم', (state) => {
    state.categories.find(row => row.id === category.id).name = 'Updated audit category';
  });
  record('DELETE', 'حذف', 'اختبار سجل التدقيق', (state) => {
    state.categories = state.categories.filter(row => row.id !== category.id);
  });

  assert.strictEqual(data.state.auditLog.length, 3);
  assert.deepStrictEqual(data.state.auditLog.map(row => row.action), ['إضافة', 'تعديل', 'حذف']);
  assert.strictEqual(data.state.auditLog[0].actor, 'Test User');
  assert.strictEqual(data.state.auditLog[0].changes[0].before, null);
  assert.strictEqual(data.state.auditLog[0].changes[0].after.name, 'Audit test category');
  assert.strictEqual(data.state.auditLog[1].changes[0].before.name, 'Audit test category');
  assert.strictEqual(data.state.auditLog[1].changes[0].after.name, 'Updated audit category');
  assert.strictEqual(data.state.auditLog[2].reason, 'اختبار سجل التدقيق');
  assert.strictEqual(data.state.auditLog[2].changes[0].after, null);
  assert.strictEqual(data.state.auditLog[2].changes[0].before.name, 'Updated audit category');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'audit_log.json'), 'utf8')).length, 3);
  console.log('Audit trail tests passed (create, update, delete, persistence)');
} finally {
  delete process.env.WH_DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
}
