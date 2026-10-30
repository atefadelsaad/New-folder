'use strict';
const jwt = require('jsonwebtoken');
const data = require('./data');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function sign(user) {
  return jwt.sign(
    { id: user.id, ver: Number(user.token_version) || 0 },
    SECRET,
    { expiresIn: '12h' }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  try {
    const claims = jwt.verify(token, SECRET);
    const user = data.state.users.find((entry) => Number(entry.id) === Number(claims.id));
    if (!user || user.active === false || (Number(claims.ver) || 0) !== (Number(user.token_version) || 0)) {
      return res.status(401).json({ error: 'الحساب غير متاح أو انتهت الجلسة، سجّل الدخول من جديد' });
    }
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      permissions: user.permissions || {}
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'جلسة غير صالحة أو منتهية' });
  }
}

module.exports = { sign, auth };
