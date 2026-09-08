const mongoose = require('mongoose');
const Event = require('../models/Event');
const Webhook = require('../models/Webhook');
const Delivery = require('../models/Delivery');
const { addDeliveryJob } = require('../queues/webhookQueue');

/**
 * @desc    Create a new event, instantiate pending delivery records, and enqueue delivery jobs into BullMQ
 * @route   POST /api/events
 * @access  Private (Protected by authMiddleware)
 */
const createEvent = async (req, res) => {
  try {
    const { type, data, payload } = req.body;
    const eventPayload = payload !== undefined ? payload : data;

    // 1. Validation: type presence
    if (!type || typeof type !== 'string' || !type.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Event type is required and must be a string',
      });
    }

    // 2. Validation: payload presence & type
    if (eventPayload === undefined || eventPayload === null || typeof eventPayload !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Event payload/data is required and must be an object',
      });
    }

    // 3. Create Event document bound to req.user.id
    const event = await Event.create({
      userId: req.user.id,
      type: type.trim(),
      payload: eventPayload,
    });

    // 4. Find all active webhooks for this user
    const activeWebhooks = await Webhook.find({
      userId: req.user.id,
      isActive: true,
    });

    // 5. Create initial PENDING delivery records for each active webhook
    let deliveriesCreated = 0;
    let queuedJobsCount = 0;
    let enqueueError = null;

    if (activeWebhooks.length > 0) {
      const deliveryDocs = activeWebhooks.map((webhook) => ({
        eventId: event._id,
        webhookId: webhook._id,
        status: 'PENDING',
        attempts: 0,
      }));

      const createdDeliveries = await Delivery.insertMany(deliveryDocs);
      deliveriesCreated = createdDeliveries.length;

      // 6. Asynchronously enqueue BullMQ jobs for each delivery record
      try {
        for (const delivery of createdDeliveries) {
          await addDeliveryJob(delivery._id);
          queuedJobsCount++;
        }
      } catch (err) {
        console.error(`[Queue Enqueue Warning] Failed to enqueue jobs into Redis: ${err.message}`);
        enqueueError = err.message;
      }
    }

    // 7. Non-blocking response returned IMMEDIATELY to client
    return res.status(201).json({
      success: true,
      message: enqueueError
        ? `Event created and saved in DB (${deliveriesCreated} deliveries), but queueing encountered error: ${enqueueError}`
        : deliveriesCreated > 0
        ? `Event published successfully. Queued ${queuedJobsCount} delivery job(s) for background processing.`
        : 'Event created successfully (no active webhooks registered)',
      event: {
        id: event._id,
        type: event.type,
        payload: event.payload,
        createdAt: event.createdAt,
      },
      deliveriesCreated,
      queuedJobsCount,
    });
  } catch (error) {
    console.error(`Create Event Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error creating event',
    });
  }
};

/**
 * @desc    Get all events belonging to authenticated user
 * @route   GET /api/events
 * @access  Private (Protected by authMiddleware)
 */
const getEvents = async (req, res) => {
  try {
    const events = await Event.find({ userId: req.user.id }).sort({ createdAt: -1 });

    const formattedEvents = events.map((e) => ({
      id: e._id,
      type: e.type,
      payload: e.payload,
      createdAt: e.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: formattedEvents.length,
      events: formattedEvents,
    });
  } catch (error) {
    console.error(`Get Events Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving events',
    });
  }
};

/**
 * @desc    Get a single event belonging to authenticated user
 * @route   GET /api/events/:id
 * @access  Private (Protected by authMiddleware)
 */
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid event ID format',
      });
    }

    const event = await Event.findOne({
      _id: id,
      userId: req.user.id,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found',
      });
    }

    return res.status(200).json({
      success: true,
      event: {
        id: event._id,
        type: event.type,
        payload: event.payload,
        createdAt: event.createdAt,
      },
    });
  } catch (error) {
    console.error(`Get Event By ID Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving event',
    });
  }
};

module.exports = {
  createEvent,
  getEvents,
  getEventById,
};
