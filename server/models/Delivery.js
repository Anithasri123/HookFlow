const mongoose = require('mongoose');

/**
 * Delivery Schema definition
 * Represents an individual delivery attempt record linking an Event to a target Webhook.
 */
const deliverySchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
      index: true,
    },
    webhookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Webhook',
      required: [true, 'Webhook ID is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    responseStatus: {
      type: Number,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for querying delivery logs by event and status
deliverySchema.index({ eventId: 1, status: 1 });
deliverySchema.index({ webhookId: 1, status: 1 });

const Delivery = mongoose.model('Delivery', deliverySchema);

module.exports = Delivery;
