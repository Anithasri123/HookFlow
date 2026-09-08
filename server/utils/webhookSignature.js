const crypto = require('crypto');

/**
 * Utility for HMAC-SHA256 webhook signature generation and timing-safe verification.
 */

/**
 * Generate HMAC-SHA256 signature for a given payload string and secret.
 * @param {string|object} payload - Transmitted HTTP body (string or object)
 * @param {string} secret - Webhook secret key
 * @returns {string} Hex-encoded HMAC-SHA256 signature
 */
const generateSignature = (payload, secret) => {
  if (!secret) {
    throw new Error('Secret is required for HMAC signature generation');
  }

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString, 'utf8')
    .digest('hex');
};

/**
 * Verify HMAC-SHA256 signature using timing-safe comparison to prevent timing attacks.
 * @param {string|object} payload - Transmitted HTTP body
 * @param {string} signature - Signature received in X-HookFlow-Signature header
 * @param {string} secret - Webhook secret key
 * @returns {boolean} True if signature is valid, false otherwise
 */
const verifySignature = (payload, signature, secret) => {
  if (!signature || typeof signature !== 'string' || !secret) {
    return false;
  }

  try {
    const expectedSignature = generateSignature(payload, secret);

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    // Buffer length check prior to timingSafeEqual to prevent length mismatch exceptions
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
};

module.exports = {
  generateSignature,
  verifySignature,
};
