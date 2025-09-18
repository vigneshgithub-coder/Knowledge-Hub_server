const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema(
  {
    action: { 
      type: String, 
      enum: ['created', 'updated', 'deleted', 'version_created'], 
      required: true 
    },
    document: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Document', 
      required: true 
    },
    documentTitle: {
      type: String,
      required: true
    },
    versionNumber: {
      type: Number,
      default: 1
    },
    changes: {
      title: { type: Boolean, default: false },
      content: { type: Boolean, default: false },
      tags: { type: Boolean, default: false },
      summary: { type: Boolean, default: false }
    },
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    metadata: {
      previousVersion: { type: mongoose.Schema.Types.Mixed },
      newVersion: { type: mongoose.Schema.Types.Mixed }
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Add text index for search
ActivitySchema.index({ documentTitle: 'text' });

// Add a virtual for formatted date
ActivitySchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Add a virtual for action icon
ActivitySchema.virtual('actionIcon').get(function() {
  const icons = {
    created: 'add',
    updated: 'edit',
    deleted: 'delete',
    version_created: 'history'
  };
  return icons[this.action] || 'info';
});

module.exports = mongoose.model('Activity', ActivitySchema);
