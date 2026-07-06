const mongoose = require('mongoose');

const CourtroomArgumentSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const CourtroomSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  caseFacts: {
    type: String,
    required: true
  },
  arguments: [CourtroomArgumentSchema],
  verdict: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

CourtroomSessionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CourtroomSession', CourtroomSessionSchema);
