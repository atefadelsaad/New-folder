'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://wh:wh@localhost:5432/warehouse',
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
});

module.exports = { pool };
