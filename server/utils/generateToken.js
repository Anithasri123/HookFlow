const jwt = require('jsonwebtoken');

/**
 * Generate a JWT signed token containing the user's ID
 * @param {string} userId - Mongoose User ObjectId
 * @returns {string} JWT Token
 */
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is missing from environment variables');
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';

  return jwt.sign({ userId }, secret, {
    expiresIn,
  });
};

module.exports = generateToken;
