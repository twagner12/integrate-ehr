import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import { errorHandler } from './middleware/errorHandler.js';
import router from './routes/index.js';
import { handleStripeWebhook } from './routes/payments.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Stripe webhook needs raw body — must be before express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(clerkMiddleware());

// Routes
app.use('/api', router);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Integrate API running on port ${PORT}`);
  startScheduler();
});
