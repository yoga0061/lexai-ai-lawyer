const jwt = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-only-jwt-fallback-do-not-use-in-production';
}

function authMiddleware(req, res, next) {
  if ((process.env.NODE_ENV === 'production' || process.env.VERCEL) && !process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Configuration Error: JWT_SECRET environment variable is missing on the server.' });
  }

  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token, access denied' });
  }

  // Expecting format: Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Token format is invalid, must be Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded; // { id: userId, username: '...' }
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token is not valid or expired' });
  }
}

function optionalAuthMiddleware(req, res, next) {
  if ((process.env.NODE_ENV === 'production' || process.env.VERCEL) && !process.env.JWT_SECRET) {
    req.user = null;
    return next();
  }

  const authHeader = req.header('Authorization');
  if (!authHeader) {
    req.user = null;
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    req.user = null;
    return next();
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
  } catch (error) {
    req.user = null; // Ignore invalid token and treat as anonymous query
  }
  next();
}

module.exports = { authMiddleware, optionalAuthMiddleware, getJwtSecret };
