const mongoose = require('mongoose');
const validator = require('validator');
const Webhook = require('../models/Webhook');

/**
 * @desc    Create a new webhook for authenticated user
 * @route   POST /api/webhooks
 * @access  Private (Protected by authMiddleware)
 */
const createWebhook = async (req, res) => {
  try {
    const { url, secret } = req.body;

    // 1. Validation: presence
    if (!url || !secret) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both URL and secret',
      });
    }

    const trimmedUrl = url.trim();
    const trimmedSecret = secret.trim();

    // 2. Validation: URL format (allow localhost and IP addresses)
    if (
      !validator.isURL(trimmedUrl, {
        protocols: ['http', 'https'],
        require_protocol: true,
        require_tld: false,
      })
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid HTTP or HTTPS URL',
      });
    }

    // 3. Validation: secret length
    if (trimmedSecret.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Secret must be at least 3 characters long',
      });
    }

    // 4. Create Webhook bound strictly to req.user.id
    const webhook = await Webhook.create({
      userId: req.user.id,
      url: trimmedUrl,
      secret: trimmedSecret,
      isActive: true,
    });

    // 5. Return safe response (secret excluded by toJSON transform)
    return res.status(201).json({
      success: true,
      message: 'Webhook created successfully',
      webhook: {
        id: webhook._id,
        url: webhook.url,
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
      },
    });
  } catch (error) {
    console.error(`Create Webhook Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error creating webhook',
    });
  }
};

/**
 * @desc    Get all webhooks belonging to authenticated user
 * @route   GET /api/webhooks
 * @access  Private (Protected by authMiddleware)
 */
const getWebhooks = async (req, res) => {
  try {
    const webhooks = await Webhook.find({ userId: req.user.id }).sort({ createdAt: -1 });

    const safeWebhooks = webhooks.map((w) => ({
      id: w._id,
      url: w.url,
      isActive: w.isActive,
      createdAt: w.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: safeWebhooks.length,
      webhooks: safeWebhooks,
    });
  } catch (error) {
    console.error(`Get Webhooks Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving webhooks',
    });
  }
};

/**
 * @desc    Delete a webhook belonging to authenticated user
 * @route   DELETE /api/webhooks/:id
 * @access  Private (Protected by authMiddleware)
 */
const deleteWebhook = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook ID format',
      });
    }

    // Ensure deletion is strictly scoped to _id AND userId
    const deletedWebhook = await Webhook.findOneAndDelete({
      _id: id,
      userId: req.user.id,
    });

    if (!deletedWebhook) {
      return res.status(404).json({
        success: false,
        message: 'Webhook not found or unauthorized',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook deleted successfully',
      id: deletedWebhook._id,
    });
  } catch (error) {
    console.error(`Delete Webhook Error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting webhook',
    });
  }
};

module.exports = {
  createWebhook,
  getWebhooks,
  deleteWebhook,
};
