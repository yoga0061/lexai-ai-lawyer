const mongoose = require('mongoose');

// Disable command buffering globally so database queries fail immediately if MongoDB is down
mongoose.set('bufferCommands', false);

async function connectDB() {
  const dbUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lexai-v2';
  const options = {
    serverSelectionTimeoutMS: 5000, // Terminate database selection after 5s if offline
  };
  try {
    await mongoose.connect(dbUri, options);
    console.log('MongoDB connected successfully to LexAI v2 database.');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
  }
}

module.exports = { connectDB };
