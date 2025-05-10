import express from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Rating validation schema
const ratingSchema = z.object({
  product_id: z.number().int().positive(),
  rating: z.number().min(1).max(5),
  review: z.string().optional()
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Add or update rating
router.post('/', verifyToken, async (req, res) => {
  try {
    const validatedData = ratingSchema.parse(req.body);

    // Check if product exists
    const [products] = await req.app.locals.pool.query(
      'SELECT * FROM products WHERE id = ?',
      [validatedData.product_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user already rated this product
    const [existingRatings] = await req.app.locals.pool.query(
      'SELECT * FROM product_ratings WHERE product_id = ? AND user_id = ?',
      [validatedData.product_id, req.userId]
    );

    if (existingRatings.length > 0) {
      // Update existing rating
      await req.app.locals.pool.query(
        'UPDATE product_ratings SET rating = ?, review = ? WHERE product_id = ? AND user_id = ?',
        [validatedData.rating, validatedData.review, validatedData.product_id, req.userId]
      );
    } else {
      // Create new rating
      await req.app.locals.pool.query(
        'INSERT INTO product_ratings (product_id, user_id, rating, review) VALUES (?, ?, ?, ?)',
        [validatedData.product_id, req.userId, validatedData.rating, validatedData.review]
      );
    }

    // Get updated rating stats
    const [ratingStats] = await req.app.locals.pool.query(
      'SELECT AVG(rating) as average_rating, COUNT(*) as total_ratings FROM product_ratings WHERE product_id = ?',
      [validatedData.product_id]
    );

    res.json({
      message: 'Rating submitted successfully',
      stats: ratingStats[0]
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to submit rating' });
    }
  }
});

// Get product ratings
router.get('/product/:productId', async (req, res) => {
  try {
    const [ratings] = await req.app.locals.pool.query(
      `SELECT pr.*, u.name as user_name 
       FROM product_ratings pr 
       JOIN users u ON pr.user_id = u.id 
       WHERE pr.product_id = ? 
       ORDER BY pr.created_at DESC`,
      [req.params.productId]
    );

    const [stats] = await req.app.locals.pool.query(
      'SELECT AVG(rating) as average_rating, COUNT(*) as total_ratings FROM product_ratings WHERE product_id = ?',
      [req.params.productId]
    );

    res.json({
      ratings,
      stats: stats[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// Get user's ratings
router.get('/user', verifyToken, async (req, res) => {
  try {
    const [ratings] = await req.app.locals.pool.query(
      `SELECT pr.*, p.name as product_name, p.image_url as product_image 
       FROM product_ratings pr 
       JOIN products p ON pr.product_id = p.id 
       WHERE pr.user_id = ? 
       ORDER BY pr.created_at DESC`,
      [req.userId]
    );

    res.json(ratings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user ratings' });
  }
});

// Delete rating
router.delete('/:productId', verifyToken, async (req, res) => {
  try {
    await req.app.locals.pool.query(
      'DELETE FROM product_ratings WHERE product_id = ? AND user_id = ?',
      [req.params.productId, req.userId]
    );

    // Get updated rating stats
    const [ratingStats] = await req.app.locals.pool.query(
      'SELECT AVG(rating) as average_rating, COUNT(*) as total_ratings FROM product_ratings WHERE product_id = ?',
      [req.params.productId]
    );

    res.json({
      message: 'Rating deleted successfully',
      stats: ratingStats[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete rating' });
  }
});

export default router; 