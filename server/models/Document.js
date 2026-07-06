const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    required: true
  },
  risks: {
    type: [String],
    default: []
  },
  clauses: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

DocumentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Document', DocumentSchema);
