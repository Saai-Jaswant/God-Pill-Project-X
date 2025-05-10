import express from 'express';
import { z } from 'zod';

const router = express.Router();

// Product validation schema
const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  barcode: z.string().optional(),
  manufacturer: z.string().optional(),
  category: z.string().optional(),
  image_url: z.string().url().optional()
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const [products] = await req.app.locals.pool.query(
      'SELECT * FROM products ORDER BY created_at DESC'
    );
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const [products] = await req.app.locals.pool.query(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get ingredients
    const [ingredients] = await req.app.locals.pool.query(
      'SELECT * FROM product_ingredients WHERE product_id = ?',
      [req.params.id]
    );

    // Get health claims
    const [healthClaims] = await req.app.locals.pool.query(
      'SELECT * FROM product_health_claims WHERE product_id = ?',
      [req.params.id]
    );

    // Get average rating
    const [ratings] = await req.app.locals.pool.query(
      'SELECT AVG(rating) as average_rating, COUNT(*) as total_ratings FROM product_ratings WHERE product_id = ?',
      [req.params.id]
    );

    res.json({
      ...products[0],
      ingredients,
      healthClaims,
      ratings: ratings[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create new product
router.post('/', async (req, res) => {
  try {
    const validatedData = productSchema.parse(req.body);
    
    const [result] = await req.app.locals.pool.query(
      'INSERT INTO products (name, description, barcode, manufacturer, category, image_url) VALUES (?, ?, ?, ?, ?, ?)',
      [
        validatedData.name,
        validatedData.description,
        validatedData.barcode,
        validatedData.manufacturer,
        validatedData.category,
        validatedData.image_url
      ]
    );

    const [newProduct] = await req.app.locals.pool.query(
      'SELECT * FROM products WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(newProduct[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create product' });
    }
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const validatedData = productSchema.parse(req.body);
    
    await req.app.locals.pool.query(
      'UPDATE products SET name = ?, description = ?, barcode = ?, manufacturer = ?, category = ?, image_url = ? WHERE id = ?',
      [
        validatedData.name,
        validatedData.description,
        validatedData.barcode,
        validatedData.manufacturer,
        validatedData.category,
        validatedData.image_url,
        req.params.id
      ]
    );

    const [updatedProduct] = await req.app.locals.pool.query(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );

    res.json(updatedProduct[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to update product' });
    }
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query(
      'DELETE FROM products WHERE id = ?',
      [req.params.id]
    );
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Search products
router.get('/search/:query', async (req, res) => {
  try {
    const searchQuery = `%${req.params.query}%`;
    const [products] = await req.app.locals.pool.query(
      'SELECT * FROM products WHERE name LIKE ? OR description LIKE ? OR manufacturer LIKE ?',
      [searchQuery, searchQuery, searchQuery]
    );
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search products' });
  }
});

export default router; 