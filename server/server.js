const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const eventRoutes = require('./routes/eventRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');

// Load environment variables from .env file
dotenv.config();

const app = express();

// Express JSON middleware
app.use(express.json());

// CORS configuration for local development
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  })
);

const { verifySignature } = require('./utils/webhookSignature');

// Health Check Endpoint (Unauthenticated)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HookFlow API is running',
  });
});

// Phase 3 & 4 Test Webhook Destination Endpoints (Used for testing webhook delivery, HMAC & retries)
let intermittentCounter = 0;

app.post('/api/test/webhook/success', (req, res) => {
  const signature = req.headers['x-hookflow-signature'];
  const deliveryId = req.headers['x-hookflow-delivery-id'];
  const eventType = req.headers['x-hookflow-event'];

  res.status(200).json({
    success: true,
    message: 'Mock webhook endpoint received payload successfully',
    receivedHeaders: {
      signature,
      deliveryId,
      eventType,
    },
    receivedPayload: req.body,
  });
});

app.post('/api/test/webhook/fail', (req, res) => {
  res.status(500).json({
    success: false,
    message: 'Mock webhook endpoint failed deliberately with 500 Internal Server Error',
  });
});

app.post('/api/test/webhook/intermittent', (req, res) => {
  intermittentCounter++;
  if (intermittentCounter < 3) {
    return res.status(500).json({
      success: false,
      message: `Intermittent endpoint deliberate failure (Attempt ${intermittentCounter} of 3)`,
    });
  }

  // Reset counter after successful 3rd attempt
  intermittentCounter = 0;
  return res.status(200).json({
    success: true,
    message: 'Intermittent endpoint succeeded on 3rd attempt!',
  });
});

/**
 * Dedicated HMAC Signature Verification Test Endpoint
 * Allows external callers to test HMAC verification logic by passing { secret } query param
 */
app.post('/api/test/webhook/verify', (req, res) => {
  const signature = req.headers['x-hookflow-signature'];
  const deliveryId = req.headers['x-hookflow-delivery-id'];
  const secret = req.query.secret || req.body.secret;

  if (!secret) {
    return res.status(400).json({
      success: false,
      message: 'Secret parameter is required to verify signature',
    });
  }

  const isValid = verifySignature(req.body, signature, secret);

  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid HMAC signature',
      deliveryId,
    });
  }

  return res.status(200).json({
    success: true,
    message: 'HMAC Signature Verified Successfully!',
    deliveryId,
    verifiedAt: new Date(),
  });
});


// Phase 1 Authentication Routes
app.use('/api/auth', authRoutes);

// Phase 2 Core Feature Routes
app.use('/api/webhooks', webhookRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/deliveries', deliveryRoutes);

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Resource not found',
  });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

/**
 * Start Server after establishing database connection
 */
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`HookFlow Server running on port ${PORT}`);
  });
};

startServer();
