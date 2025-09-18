const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['created', 'updated', 'deleted'], required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Activity', ActivitySchema);
