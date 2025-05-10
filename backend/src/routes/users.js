import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

// User validation schemas
const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const validatedData = userSchema.parse(req.body);
    
    // Check if user already exists
    const [existingUsers] = await req.app.locals.pool.query(
      'SELECT * FROM users WHERE email = ?',
      [validatedData.email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Create user
    const [result] = await req.app.locals.pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      [validatedData.email, hashedPassword, validatedData.name]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertId, email: validatedData.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: result.insertId,
        email: validatedData.email,
        name: validatedData.name
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to register user' });
    }
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);

    // Find user
    const [users] = await req.app.locals.pool.query(
      'SELECT * FROM users WHERE email = ?',
      [validatedData.email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(validatedData.password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to login' });
    }
  }
});

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const [users] = await req.app.locals.pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(users[0]);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const { name, password } = req.body;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await req.app.locals.pool.query(
        'UPDATE users SET name = ?, password_hash = ? WHERE id = ?',
        [name, hashedPassword, decoded.userId]
      );
    } else {
      await req.app.locals.pool.query(
        'UPDATE users SET name = ? WHERE id = ?',
        [name, decoded.userId]
      );
    }

    const [updatedUser] = await req.app.locals.pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );

    res.json(updatedUser[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router; 