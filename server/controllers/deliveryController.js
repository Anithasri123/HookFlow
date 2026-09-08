const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const Event = require('../models/Event');

/**
 * @desc    Get all delivery tracking records for authenticated user
 * @route   GET /api/deliveries
 * @access  Private (Protected by authMiddleware)
 */
const getDeliveries = async (req, res) => {
  try {
    // 1. Fetch event IDs belonging to authenticated user
    const userEvents = await Event.find({ userId: req.user.id }).select('_id');
    const userEventIds = userEvents.map((e) => e._id);

    if (userEventIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        deliveries: [],
      });
    }

    // 2. Query deliveries linked to the user's events
    const deliveries = await Delivery.find({ eventId: { $in: userEventIds } })
      .populate('eventId', 'type payload')
      .populate('webhookId', 'url isActive')
      .sort({ createdAt: -1 });

    const formattedDeliveries = deliveries.map((d) => ({
      id: d._id,
      eventId: d.eventId?._id || d.eventId,
      eventType: d.eventId?.type || 'unknown',
      webhookId: d.webhookId?._id || d.webhookId,
      webhookUrl: d.webhookId?.url || 'N/A',
      status: d.status,
      attempts: d.attempts,
      lastAttemptAt: d.lastAttemptAt,
      responseStatus: d.responseStatus,
      error: d.error,
      createdAt: d.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: formattedDeliveries.length,
      deliveries: formattedDeliveries,
    });
  } catch (error) {
    console.error(`Get Deliveries Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving deliveries',
    });
  }
};

/**
 * @desc    Get single delivery tracking record by ID for authenticated user
 * @route   GET /api/deliveries/:id
 * @access  Private (Protected by authMiddleware)
 */
const getDeliveryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery ID format',
      });
    }

    const delivery = await Delivery.findById(id)
      .populate('eventId', 'userId type payload')
      .populate('webhookId', 'userId url isActive');

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found',
      });
    }

    // Ensure strict ownership check: event or webhook must belong to req.user.id
    const eventOwnerId = delivery.eventId?.userId?.toString();
    const webhookOwnerId = delivery.webhookId?.userId?.toString();

    if (eventOwnerId !== req.user.id && webhookOwnerId !== req.user.id) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found',
      });
    }

    return res.status(200).json({
      success: true,
      delivery: {
        id: delivery._id,
        eventId: delivery.eventId?._id,
        eventType: delivery.eventId?.type,
        eventPayload: delivery.eventId?.payload,
        webhookId: delivery.webhookId?._id,
        webhookUrl: delivery.webhookId?.url,
        status: delivery.status,
        attempts: delivery.attempts,
        lastAttemptAt: delivery.lastAttemptAt,
        responseStatus: delivery.responseStatus,
        error: delivery.error,
        createdAt: delivery.createdAt,
      },
    });
  } catch (error) {
    console.error(`Get Delivery By ID Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving delivery',
    });
  }
};

module.exports = {
  getDeliveries,
  getDeliveryById,
};
