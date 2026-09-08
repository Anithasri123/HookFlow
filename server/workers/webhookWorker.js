const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const connectDB = require('../config/db');
const { redisOptions } = require('../config/redis');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Delivery = require('../models/Delivery');
const Event = require('../models/Event');
const Webhook = require('../models/Webhook');
const { QUEUE_NAME } = require('../queues/webhookQueue');

const { generateSignature } = require('../utils/webhookSignature');

const HTTP_TIMEOUT_MS = 5000;

/**
 * Worker Process Execution Logic
 * Processes individual webhook delivery jobs asynchronously.
 */
const processDeliveryJob = async (job) => {
  const { deliveryId } = job.data;
  const currentAttempt = (job.attemptsMade || 0) + 1;

  console.log(`[Worker] Starting job ${job.id} for Delivery ID: ${deliveryId} (Attempt ${currentAttempt})`);


  // 1. Fetch Delivery document from MongoDB
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    console.error(`[Worker Error] Delivery ID ${deliveryId} not found in database.`);
    return;
  }

  // 2. Idempotency Guard: Skip if already marked SUCCESS
  if (delivery.status === 'SUCCESS') {
    console.log(`[Worker Idempotency] Delivery ID ${deliveryId} already completed successfully. Skipping execution.`);
    return;
  }

  // 3. Fetch linked Event and Webhook documents
  const event = await Event.findById(delivery.eventId);
  const webhook = await Webhook.findById(delivery.webhookId);

  if (!event || !webhook || !webhook.isActive) {
    console.error(`[Worker Error] Event or Webhook is inactive/missing for Delivery ${deliveryId}.`);
    delivery.status = 'FAILED';
    delivery.error = 'Webhook or Event missing or inactive';
    delivery.lastAttemptAt = new Date();
    await delivery.save();
    return;
  }

  // 4. Atomic Concurrency Guard: Transition status to PROCESSING
  const processingDelivery = await Delivery.findOneAndUpdate(
    { _id: deliveryId, status: { $ne: 'SUCCESS' } },
    { $set: { status: 'PROCESSING' } },
    { new: true }
  );

  if (!processingDelivery) {
    console.log(`[Worker Concurrency Guard] Delivery ${deliveryId} state conflict or already SUCCESS. Aborting execution.`);
    return;
  }

  // 5. Build & Serialize Webhook Payload ONCE for exact HMAC matching
  const webhookPayload = {
    eventId: event._id,
    type: event.type,
    data: event.payload,
  };

  const payloadString = JSON.stringify(webhookPayload);

  // 6. Generate HMAC-SHA256 Signature using Webhook Secret
  const signature = generateSignature(payloadString, webhook.secret);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  let responseStatus = null;
  let errorMessage = null;
  let isSuccess = false;

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HookFlow-Signature': signature,
        'X-HookFlow-Delivery-ID': delivery._id.toString(),
        'X-HookFlow-Event': event.type,
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    responseStatus = response.status;

    if (response.ok) {
      isSuccess = true;
    } else {
      errorMessage = `HTTP error ${response.status} ${response.statusText}`;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      errorMessage = `HTTP request timed out after ${HTTP_TIMEOUT_MS}ms`;
    } else {
      errorMessage = err.message || 'Network request failed';
    }
  }

  // 7. Synchronize MongoDB Delivery document
  delivery.attempts = currentAttempt;
  delivery.lastAttemptAt = new Date();
  delivery.responseStatus = responseStatus;
  delivery.error = errorMessage;

  const maxAttempts = job.opts.attempts || 3;
  const isFinalAttempt = currentAttempt >= maxAttempts;

  if (isSuccess) {
    delivery.status = 'SUCCESS';
    delivery.error = null;
    await delivery.save();
    console.log(`[Worker] Delivery ${deliveryId} Succeeded with HTTP ${responseStatus} (Attempt ${currentAttempt})`);
    return;
  }

  if (isFinalAttempt) {
    delivery.status = 'FAILED';
    await delivery.save();
    console.error(`[Worker] Delivery ${deliveryId} PERMANENTLY FAILED after ${currentAttempt} attempts. Error: ${errorMessage}`);
    return;
  }

  // If retries remain, save updated attempt state and throw error for BullMQ backoff retry
  await delivery.save();
  console.warn(`[Worker] Delivery ${deliveryId} failed attempt ${currentAttempt}/${maxAttempts} (${errorMessage}). Scheduling BullMQ exponential retry...`);
  throw new Error(`Webhook delivery attempt ${currentAttempt} failed: ${errorMessage}`);
};

/**
 * Initialize Worker Process
 */
const startWorker = async () => {
  await connectDB();

  const worker = new Worker(QUEUE_NAME, processDeliveryJob, {
    connection: redisOptions,
    concurrency: 5,
  });

  worker.on('ready', () => {
    console.log(`====================================================`);
    console.log(`   HOOKFLOW BACKGROUND WORKER ACTIVE (${QUEUE_NAME})   `);
    console.log(`   HMAC-SHA256 Signing & Idempotency Header Active   `);
    console.log(`====================================================`);
  });

  worker.on('failed', (job, err) => {
    console.log(`[Worker Notification] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error(`[Worker Global Error] ${err.message}`);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down worker process...');
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
  });
};

// Auto-run if executed directly via CLI (npm run worker)
if (require.main === module) {
  startWorker();
}

module.exports = { startWorker, processDeliveryJob };

