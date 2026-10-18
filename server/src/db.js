'use strict';
const sql = require('mssql');

const DB_NAME = process.env.DB_NAME || 'it_warehouse';
if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) throw new Error('Invalid DB_NAME');

const base = {
  server: process.env.DB_SERVER || 'localhost',
  port: Number(process.env.DB_PORT || 1433),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Your_password123',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 30000
};

const config = Object.assign({}, base, { database: DB_NAME });

let poolPromise = null;
function getPool() {
  if (!poolPromise) poolPromise = new sql.ConnectionPool(config).connect();
  return poolPromise;
}

// Create the target database on first boot (connect to master, then close).
async function ensureDatabase() {
  const master = await new sql.ConnectionPool(Object.assign({}, base, { database: 'master' })).connect();
  try {
    await master.request().query(`IF DB_ID(N'${DB_NAME}') IS NULL CREATE DATABASE [${DB_NAME}];`);
  } finally {
    await master.close();
  }
}

module.exports = { sql, getPool, ensureDatabase, DB_NAME };
