const { Queue } = require('bullmq');
const { redisOptions } = require('../config/redis');

const QUEUE_NAME = 'webhook-delivery';

/**
 * BullMQ Queue Instance for Webhook Delivery
 */
const webhookQueue = new Queue(QUEUE_NAME, {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s initial delay, exponentially increases on subsequent retries
    },
    removeOnComplete: false,
    removeOnFail: false,
  },
});

/**
 * Enqueue a webhook delivery job into BullMQ
 * @param {string|ObjectId} deliveryId - MongoDB Delivery document ID
 * @returns {Promise<Job>} BullMQ Job instance
 */
const addDeliveryJob = async (deliveryId) => {
  const idStr = deliveryId.toString();
  try {
    // Stable job ID based on deliveryId to reduce duplicate enqueues
    const job = await webhookQueue.add(
      'deliver',
      { deliveryId: idStr },
      { jobId: `job-delivery-${idStr}` }
    );
    console.log(`[Queue] Enqueued delivery job ${job.id} for Delivery ID: ${idStr}`);
    return job;
  } catch (error) {
    console.error(`[Queue Error] Failed to enqueue delivery job ${idStr}: ${error.message}`);
    throw error;
  }
};

module.exports = {
  webhookQueue,
  addDeliveryJob,
  QUEUE_NAME,
};
