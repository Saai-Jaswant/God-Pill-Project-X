import express from 'express';
import { z } from 'zod';

const router = express.Router();

// Newsletter subscription schema
const subscriptionSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional()
});

// Subscribe to newsletter
router.post('/subscribe', async (req, res) => {
  try {
    const validatedData = subscriptionSchema.parse(req.body);

    // Check if already subscribed
    const [existingSubscribers] = await req.app.locals.pool.query(
      'SELECT * FROM newsletter_subscribers WHERE email = ?',
      [validatedData.email]
    );

    if (existingSubscribers.length > 0) {
      const subscriber = existingSubscribers[0];
      if (subscriber.is_active) {
        return res.status(400).json({ error: 'Email already subscribed' });
      } else {
        // Reactivate subscription
        await req.app.locals.pool.query(
          'UPDATE newsletter_subscribers SET is_active = TRUE, name = ? WHERE email = ?',
          [validatedData.name, validatedData.email]
        );
        return res.json({ message: 'Subscription reactivated successfully' });
      }
    }

    // Create new subscription
    await req.app.locals.pool.query(
      'INSERT INTO newsletter_subscribers (email, name) VALUES (?, ?)',
      [validatedData.email, validatedData.name]
    );

    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to subscribe' });
    }
  }
});

// Unsubscribe from newsletter
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const [result] = await req.app.locals.pool.query(
      'UPDATE newsletter_subscribers SET is_active = FALSE WHERE email = ?',
      [email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Email not found in subscribers list' });
    }

    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Get all active subscribers (admin only)
router.get('/subscribers', async (req, res) => {
  try {
    const [subscribers] = await req.app.locals.pool.query(
      'SELECT * FROM newsletter_subscribers WHERE is_active = TRUE ORDER BY subscribed_at DESC'
    );

    res.json(subscribers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

export default router; 