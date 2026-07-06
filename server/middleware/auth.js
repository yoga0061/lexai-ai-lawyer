const jwt = require('jsonwebtoken');

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('JWT_SECRET environment variable is required in production.');
  }
  console.warn('WARNING: JWT_SECRET not set. Using development-only fallback.');
  return 'dev-only-jwt-fallback-do-not-use-in-production';
}

const JWT_SECRET = resolveJwtSecret();

function authMiddleware(req, res, next) {
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
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id: userId, username: '...' }
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token is not valid or expired' });
  }
}

function optionalAuthMiddleware(req, res, next) {
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
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (error) {
    req.user = null; // Ignore invalid token and treat as anonymous query
  }
  next();
}

module.exports = { authMiddleware, optionalAuthMiddleware, JWT_SECRET };
