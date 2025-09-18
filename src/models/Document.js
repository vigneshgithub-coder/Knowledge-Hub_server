const mongoose = require('mongoose');
const diff = require('diff');

const VersionSchema = new mongoose.Schema(
  {
    versionNumber: { type: Number, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    summary: { type: String, default: '' },
    tags: { type: [String], default: [] },
    editedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
    },
    changes: {
      title: { type: Boolean, default: false },
      content: { type: Boolean, default: false },
      tags: { type: Boolean, default: false },
      summary: { type: Boolean, default: false }
    },
    diff: {
      title: { type: String, default: '' },
      content: { type: String, default: '' },
      tags: { type: String, default: '' },
      summary: { type: String, default: '' }
    }
  },
  { 
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Add a virtual for formatted date
VersionSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

const DocumentSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: true, 
      trim: true,
      index: true 
    },
    content: { 
      type: String, 
      required: true 
    },
    summary: { 
      type: String, 
      default: '' 
    },
    tags: { 
      type: [String], 
      default: [],
      index: true 
    },
    embedding: { 
      type: [Number], 
      default: [],
      select: false
    },
    currentVersion: { 
      type: Number, 
      default: 1 
    },
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    versions: { 
      type: [VersionSchema], 
      default: [] 
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Add text index for search
DocumentSchema.index(
  { 
    title: 'text', 
    content: 'text',
    summary: 'text',
    tags: 'text'
  },
  {
    weights: {
      title: 10,
      tags: 5,
      summary: 2,
      content: 1
    }
  }
);

// Add a virtual for the latest version
DocumentSchema.virtual('latestVersion').get(function() {
  return this.versions[this.versions.length - 1] || null;
});

// Add a virtual for the number of versions
DocumentSchema.virtual('versionCount').get(function() {
  return this.versions.length;
});

// Helper method to create a new version
DocumentSchema.methods.createVersion = async function(user, changes = {}) {
  this.currentVersion += 1;
  this.lastUpdatedBy = user._id;
  
  // Create a new version with the current state
  const newVersion = {
    versionNumber: this.currentVersion,
    title: this.title,
    content: this.content,
    summary: this.summary,
    tags: [...this.tags],
    editedBy: user._id,
    changes: {
      title: changes.title || false,
      content: changes.content || false,
      tags: changes.tags || false,
      summary: changes.summary || false
    }
  };

  // If we have a previous version, calculate diffs
  if (this.versions.length > 0) {
    const prevVersion = this.versions[this.versions.length - 1];
    
    // Calculate diff for title
    if (changes.title) {
      const titleDiff = diff.diffWords(prevVersion.title, this.title);
      newVersion.diff.title = titleDiff.map(part => ({
        value: part.value,
        added: part.added,
        removed: part.removed
      }));
    }
    
    // Calculate diff for content (only if content changed)
    if (changes.content) {
      const contentDiff = diff.diffWords(prevVersion.content, this.content);
      newVersion.diff.content = contentDiff.map(part => ({
        value: part.value,
        added: part.added,
        removed: part.removed
      }));
    }
    
    // For tags and summary, just store the previous values
    if (changes.tags) {
      newVersion.diff.tags = {
        from: prevVersion.tags,
        to: this.tags
      };
    }
    
    if (changes.summary) {
      newVersion.diff.summary = {
        from: prevVersion.summary,
        to: this.summary
      };
    }
  }
  
  // Add the new version
  this.versions.push(newVersion);
  
  // Keep only the last 10 versions (plus the current one)
  if (this.versions.length > 10) {
    this.versions = this.versions.slice(-10);
  }
  
  await this.save();
  return newVersion;
};

// Soft delete method
DocumentSchema.methods.softDelete = async function() {
  this.isDeleted = true;
  await this.save();
};

// Static method to find non-deleted documents
DocumentSchema.statics.findActive = function() {
  return this.find({ isDeleted: { $ne: true } });
};

// Query helper for non-deleted documents
DocumentSchema.query.active = function() {
  return this.where({ isDeleted: { $ne: true } });
};

// Pre-save hook to ensure versions are properly maintained
DocumentSchema.pre('save', function(next) {
  if (this.isNew) {
    // For new documents, create the initial version
    this.versions.push({
      versionNumber: 1,
      title: this.title,
      content: this.content,
      summary: this.summary,
      tags: [...this.tags],
      editedBy: this.createdBy,
      changes: {
        title: true,
        content: true,
        tags: true,
        summary: true
      }
    });
  }
  next();
});

module.exports = mongoose.model('Document', DocumentSchema);
