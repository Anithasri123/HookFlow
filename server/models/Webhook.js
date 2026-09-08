const mongoose = require('mongoose');
const validator = require('validator');

/**
 * Webhook Schema definition
 * Represents an external endpoint registered by a user to receive webhook events.
 */
const webhookSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    url: {
      type: String,
      required: [true, 'Webhook URL is required'],
      trim: true,
      validate: {
        validator: function (value) {
          return validator.isURL(value, {
            protocols: ['http', 'https'],
            require_protocol: true,
            require_tld: false, // Allow localhost and IP addresses for local testing
          });
        },
        message: 'Please provide a valid HTTP or HTTPS URL',
      },
    },
    secret: {
      type: String,
      required: [true, 'Webhook secret is required'],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.secret;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Webhook = mongoose.model('Webhook', webhookSchema);

module.exports = Webhook;
