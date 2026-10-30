'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-users-'));
process.env.WH_DATA_DIR = dataDir;
process.env.JWT_SECRET = 'user-management-test-secret';

const data = require('./src/data');
const router = require('./src/routes');
const app = express();
app.use(express.json());
app.use('/api', router);
const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (url, method, body, token) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body == null ? undefined : JSON.stringify(body)
    });
    const result = await response.json();
    return { status: response.status, result };
  };

  try {
    const adminLogin = await request('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.result.token;
    const userList = await request('/users', 'GET', null, adminToken);
    assert.strictEqual(userList.status, 200);
    assert(userList.result.users.every((user) => !Object.prototype.hasOwnProperty.call(user, 'password_hash')));

    const account = await request('/users', 'POST', {
      username: 'inventory.user',
      name: 'Inventory User',
      role: 'junior',
      password: 'initial-pass-123',
      permissions: { stock: true }
    }, adminToken);
    assert.strictEqual(account.status, 200);
    const userId = account.result.user.id;
    assert.strictEqual(account.result.user.permissions.stock, true);

    const userLogin = await request('/auth/login', 'POST', { username: 'inventory.user', password: 'initial-pass-123' });
    assert.strictEqual(userLogin.status, 200);
    const userToken = userLogin.result.token;
    const createItem = await request('/items', 'POST', {
      name: 'Permission test item',
      category: data.state.categories[0].name,
      has_warranty: false
    }, userToken);
    assert.strictEqual(createItem.status, 200);
    const forbiddenUsers = await request('/users', 'GET', null, userToken);
    assert.strictEqual(forbiddenUsers.status, 403);

    const changedPermissions = await request('/users/' + userId, 'PUT', {
      permissions: { stock: false }
    }, adminToken);
    assert.strictEqual(changedPermissions.status, 200);
    const deniedItem = await request('/items', 'POST', {
      name: 'Denied permission test item',
      category: data.state.categories[0].name,
      has_warranty: false
    }, userToken);
    assert.strictEqual(deniedItem.status, 403);

    const passwordChange = await request('/auth/password', 'PUT', {
      currentPassword: 'initial-pass-123',
      newPassword: 'changed-pass-123'
    }, userToken);
    assert.strictEqual(passwordChange.status, 200);
    const revokedByPasswordChange = await request('/bootstrap', 'GET', null, userToken);
    assert.strictEqual(revokedByPasswordChange.status, 401);
    const changedLogin = await request('/auth/login', 'POST', { username: 'inventory.user', password: 'changed-pass-123' });
    assert.strictEqual(changedLogin.status, 200);

    const reset = await request('/users/' + userId + '/password', 'PUT', { password: 'admin-reset-123' }, adminToken);
    assert.strictEqual(reset.status, 200);
    const revokedByReset = await request('/bootstrap', 'GET', null, changedLogin.result.token);
    assert.strictEqual(revokedByReset.status, 401);
    const resetLogin = await request('/auth/login', 'POST', { username: 'inventory.user', password: 'admin-reset-123' });
    assert.strictEqual(resetLogin.status, 200);

    const disabled = await request('/users/' + userId, 'PUT', { active: false }, adminToken);
    assert.strictEqual(disabled.status, 200);
    assert.strictEqual((await request('/bootstrap', 'GET', null, resetLogin.result.token)).status, 401);
    assert.strictEqual((await request('/auth/login', 'POST', { username: 'inventory.user', password: 'admin-reset-123' })).status, 401);

    const lastAdmin = await request('/users/1', 'PUT', { active: false }, adminToken);
    assert.strictEqual(lastAdmin.status, 409);
    assert.strictEqual(data.state.users.find((user) => user.role === 'admin').active, true);
    console.log('User management tests passed (permissions, passwords, deactivation, and admin lockout protection)');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close(() => {
      delete process.env.WH_DATA_DIR;
      delete process.env.JWT_SECRET;
      fs.rmSync(dataDir, { recursive: true, force: true });
    });
  }
});
