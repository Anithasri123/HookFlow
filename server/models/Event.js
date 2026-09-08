const mongoose = require('mongoose');

/**
 * Event Schema definition
 * Represents an event triggered by a user in the system.
 */
const eventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    type: {
      type: String,
      required: [true, 'Event type is required'],
      trim: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Event payload is required'],
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

// Compound index for querying a user's events sorted by newest first
eventSchema.index({ userId: 1, createdAt: -1 });

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
