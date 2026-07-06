const mongoose = require('mongoose');

// Disable command buffering globally so database queries fail immediately if MongoDB is down
mongoose.set('bufferCommands', false);

async function connectDB() {
  const dbUri = process.env.MONGODB_URI;
  
  if (!dbUri) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      console.warn('WARNING: MONGODB_URI is not defined. Skipping database connection. LexAI will run in JSON file database fallback mode.');
      return;
    }
    // Locally, attempt fallback to local MongoDB instance
    const localUri = 'mongodb://127.0.0.1:27017/lexai-v2';
    const options = {
      serverSelectionTimeoutMS: 2000, // Speed up local offline detection (2 seconds)
    };
    try {
      await mongoose.connect(localUri, options);
      console.log('MongoDB connected successfully to local LexAI v2 database.');
    } catch (error) {
      console.error('Local MongoDB connection failed, running in JSON fallback mode:', error.message);
    }
  } else {
    const options = {
      serverSelectionTimeoutMS: 5000, // 5s timeout for cloud connection
    };
    try {
      await mongoose.connect(dbUri, options);
      console.log('MongoDB connected successfully to LexAI v2 cloud database.');
    } catch (error) {
      console.error('MongoDB cloud connection failed:', error.message);
    }
  }
}

module.exports = { connectDB };
