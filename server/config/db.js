const mongoose = require('mongoose');

/**
 * Connect to MongoDB Database
 * Handles connection success and failure cleanly.
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('Database connection error: MONGO_URI is not defined in environment variables.');
      process.exit(1);
    }

    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    // Exit process with failure if DB connection cannot be established
    process.exit(1);
  }
};

module.exports = connectDB;
