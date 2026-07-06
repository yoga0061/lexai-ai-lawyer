const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const dbService = require('../services/db.service');
const { getJwtSecret, authMiddleware } = require('../middleware/auth');

// Zod schemas for input validation
const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(30),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

// Helper to sign JWT
function generateToken(user) {
  const id = user._id || user.id;
  return jwt.sign(
    { id, username: user.username },
    getJwtSecret(),
    { expiresIn: '7d' } // Token valid for 7 days
  );
}

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  try {
    // Validate request body
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0].message });
    }

    const { username, email, password } = parseResult.data;

    // Check if user already exists (by email or username)
    let user = await dbService.findUserByEmailOrUsername(email, username);
    if (user) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Create user object via service (which delegates to mongo or file db)
    const newUser = await dbService.createUser({
      username,
      email,
      password
    });

    // Generate JWT token
    const token = generateToken(newUser);

    res.status(201).json({
      token,
      user: {
        id: newUser._id || newUser.id,
        username: newUser.username,
        email: newUser.email,
        preferredLanguage: newUser.preferredLanguage
      }
    });

  } catch (error) {
    console.error('Registration Error:', error.message);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
router.post('/login', async (req, res) => {
  try {
    // Validate request body
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0].message });
    }

    const { email, password } = parseResult.data;

    // Find user by email
    const user = await dbService.findUserByEmailOrUsername(email, null);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Match password
    const isMatch = await dbService.comparePassword(user, password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id || user.id,
        username: user.username,
        email: user.email,
        preferredLanguage: user.preferredLanguage
      }
    });

  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await dbService.findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get Profile Error:', error.message);
    res.status(500).json({ error: 'Internal server error retrieving user profile' });
  }
});

module.exports = router;
