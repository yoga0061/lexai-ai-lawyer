const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const { connectDB } = require('./config/db');
connectDB(); // Connect MongoDB

const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');

// Ensure the API key exists or show warning
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('WARNING: GEMINI_API_KEY is not defined in the environment variables. AI features will fail until populated.');
}

const app = express();

// Security and utility middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabling CSP header to allow html2canvas, external scripts, fonts
}));
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // Logger

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../client/public')));

// Rate limiting setup
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Limit each IP to 150 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Enhanced error handling for JSON parsing
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  next();
});

// Register routers
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Fallback for SPA static pages: serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`LexAI v2 server running on port ${PORT}`);
  });
}
