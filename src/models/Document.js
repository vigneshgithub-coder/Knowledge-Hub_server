const mongoose = require('mongoose');

const VersionSchema = new mongoose.Schema(
  {
    title: String,
    content: String,
    summary: String,
    tags: [String],
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    summary: { type: String, default: '' },
    tags: { type: [String], default: [] },
    embedding: { type: [Number], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    versions: { type: [VersionSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', DocumentSchema);
