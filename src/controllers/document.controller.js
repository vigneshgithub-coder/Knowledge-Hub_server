const Document = require('../models/Document');
const Activity = require('../models/Activity');
const { summarizeText, generateTags, embedText } = require('../utils/gemini');
const { default: mongoose } = require('mongoose');

// Helpers
function canModify(user, doc) {
  return user.role === 'admin' || String(doc.createdBy) === String(user._id);
}

// Helper to log activity
async function logActivity(action, document, user, versionNumber = null, changes = {}) {
  try {
    await Activity.create({
      action,
      document: document._id,
      documentTitle: document.title,
      versionNumber: versionNumber || document.currentVersion,
      user: user._id,
      changes: {
        title: changes.title || false,
        content: changes.content || false,
        tags: changes.tags || false,
        summary: changes.summary || false
      },
      metadata: {
        previousVersion: changes.previousVersion || null,
        newVersion: changes.newVersion || null
      }
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

exports.createDocument = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { title, content, tags } = req.body;
    if (!title || !content) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Title and content are required' });
    }

    // AI assist
    const [summary, autoTags, embedding] = await Promise.all([
      summarizeText(content),
      generateTags(`${title}\n${content}`, 6),
      embedText(`${title}\n${content}`),
    ]);

    // Create the document
    const doc = new Document({
      title,
      content,
      summary,
      tags: tags || autoTags,
      embedding,
      createdBy: req.user._id,
      lastUpdatedBy: req.user._id
    });

    await doc.save({ session });
    
    // Log the creation activity
    await logActivity('created', doc, req.user);
    
    await session.commitTransaction();
    session.endSession();
    
    // Return the document with versions populated
    const savedDoc = await Document.findById(doc._id).populate('createdBy', 'name email').populate('lastUpdatedBy', 'name email');
    res.status(201).json(savedDoc);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error creating document:', err);
    res.status(500).json({ message: 'Failed to create document', error: err.message });
  }
};

exports.getDocuments = async (req, res) => {
  try {
    const { mine, tag, tags, q, limit = 20, page = 1 } = req.query;
    const filter = {};
    if (mine === 'true') filter.createdBy = req.user._id;
    
    // Handle both single tag and multiple tags
    if (tags) {
      const tagList = tags.split(',');
      filter.tags = { $in: tagList }; // Match any of the provided tags
    } else if (tag) {
      // Backward compatibility with single tag
      filter.tags = tag;
    }
    
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ];
    }

    const docs = await Document.find(filter)
      .populate('createdBy', 'name email role')
      .sort({ updatedAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch documents', error: err.message });
  }
};

exports.getDocumentById = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).populate('createdBy', 'name email role');
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch document', error: err.message });
  }
};

exports.updateDocument = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { title, content, tags } = req.body;
    const doc = await Document.findById(req.params.id).session(session);
    
    if (!doc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Document not found' });
    }
    
    if (!canModify(req.user, doc)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Track changes
    const changes = {
      title: title !== undefined && title !== doc.title,
      content: content !== undefined && content !== doc.content,
      tags: tags !== undefined && JSON.stringify(tags) !== JSON.stringify(doc.tags),
      summary: false // Will be set to true if content changes
    };

    // Save current state for diffing
    const previousState = {
      title: doc.title,
      content: doc.content,
      summary: doc.summary,
      tags: [...doc.tags]
    };

    // Update document fields if provided
    if (title !== undefined) doc.title = title;
    if (content !== undefined) doc.content = content;
    if (tags !== undefined) doc.tags = tags;

    // Recompute AI fields if content/title changed
    if (changes.content || changes.title) {
      const [summary, autoTags, embedding] = await Promise.all([
        summarizeText(doc.content),
        generateTags(`${doc.title}\n${doc.content}`, 6),
        embedText(`${doc.title}\n${doc.content}`),
      ]);
      
      changes.summary = doc.summary !== summary;
      doc.summary = summary;
      doc.embedding = embedding;
      
      if (!tags) {
        const newTags = Array.from(new Set([...(doc.tags || []), ...autoTags])).slice(0, 10);
        changes.tags = changes.tags || JSON.stringify(newTags) !== JSON.stringify(doc.tags);
        doc.tags = newTags;
      }
    }

    // Only create a new version if there are actual changes
    if (Object.values(changes).some(change => change)) {
      // Create a new version with the changes
      await doc.createVersion(req.user, changes);
      
      // Log the update activity
      await logActivity('updated', doc, req.user, doc.currentVersion, {
        ...changes,
        previousVersion: previousState,
        newVersion: {
          title: doc.title,
          content: doc.content,
          summary: doc.summary,
          tags: doc.tags
        }
      });
    }

    doc.lastUpdatedBy = req.user._id;
    await doc.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    // Return the updated document with versions populated
    const updatedDoc = await Document.findById(doc._id)
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .populate('versions.editedBy', 'name email');
      
    res.json(updatedDoc);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error updating document:', err);
    res.status(500).json({ message: 'Failed to update document', error: err.message });
  }
};

exports.deleteDocument = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const doc = await Document.findById(req.params.id).session(session);
    
    if (!doc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Document not found' });
    }
    
    if (!canModify(req.user, doc)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Log the deletion activity before actually deleting
    await logActivity('deleted', doc, req.user);
    
    // Soft delete the document
    await doc.softDelete();
    
    await session.commitTransaction();
    session.endSession();
    
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error deleting document:', err);
    res.status(500).json({ message: 'Failed to delete document', error: err.message });
  }
};

exports.forceSummarize = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canModify(req.user, doc)) return res.status(403).json({ message: 'Forbidden' });
    doc.summary = await summarizeText(doc.content);
    await doc.save();
    res.json({ summary: doc.summary });
  } catch (err) {
    res.status(500).json({ message: 'Failed to summarize', error: err.message });
  }
};

exports.forceTags = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canModify(req.user, doc)) return res.status(403).json({ message: 'Forbidden' });
    const newTags = await generateTags(`${doc.title}\n${doc.content}`, 6);
    doc.tags = Array.from(new Set([...(doc.tags || []), ...newTags])).slice(0, 10);
    await doc.save();
    res.json({ tags: doc.tags });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate tags', error: err.message });
  }
};

exports.activityFeed = async (req, res) => {
  try {
    const { limit = 10, skip = 0 } = req.query;
    
    const [activities, total] = await Promise.all([
      Activity.find()
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .populate('user', 'name email')
        .populate('document', 'title')
        .lean(),
      Activity.countDocuments()
    ]);
    
    // Enhance activities with human-readable messages
    const enhancedActivities = activities.map(activity => {
      const actionMap = {
        created: 'created the document',
        updated: 'updated the document',
        deleted: 'deleted the document',
        version_created: 'created a new version of the document'
      };
      
      return {
        ...activity,
        actionText: actionMap[activity.action] || 'performed an action on the document',
        timestamp: activity.createdAt
      };
    });
    
    res.json({
      activities: enhancedActivities,
      total,
      hasMore: (parseInt(skip) + activities.length) < total
    });
  } catch (err) {
    console.error('Error fetching activity feed:', err);
    res.status(500).json({ message: 'Failed to fetch activity feed', error: err.message });
  }
};

// Get version history for a document
exports.getDocumentVersions = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10, skip = 0 } = req.query;
    
    const doc = await Document.findById(id)
      .select('versions')
      .populate('versions.editedBy', 'name email')
      .lean();
    
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    // Sort versions by version number (descending)
    const sortedVersions = doc.versions.sort((a, b) => b.versionNumber - a.versionNumber);
    
    // Apply pagination
    const paginatedVersions = sortedVersions.slice(parseInt(skip), parseInt(skip) + parseInt(limit));
    
    res.json({
      versions: paginatedVersions,
      total: doc.versions.length,
      hasMore: (parseInt(skip) + paginatedVersions.length) < doc.versions.length
    });
  } catch (err) {
    console.error('Error fetching document versions:', err);
    res.status(500).json({ message: 'Failed to fetch document versions', error: err.message });
  }
};

// Restore a document to a previous version
exports.restoreVersion = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id, versionNumber } = req.params;
    
    const doc = await Document.findById(id).session(session);
    if (!doc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Document not found' });
    }
    
    if (!canModify(req.user, doc)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Find the version to restore
    const versionToRestore = doc.versions.find(v => v.versionNumber === parseInt(versionNumber));
    if (!versionToRestore) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Version not found' });
    }
    
    // Save current state as a new version before restoring
    await doc.createVersion(req.user, {
      title: true,
      content: true,
      summary: true,
      tags: true
    });
    
    // Restore the document to the selected version
    doc.title = versionToRestore.title;
    doc.content = versionToRestore.content;
    doc.summary = versionToRestore.summary;
    doc.tags = versionToRestore.tags;
    doc.lastUpdatedBy = req.user._id;
    
    await doc.save({ session });
    
    // Log the restore activity
    await logActivity('version_created', doc, req.user, doc.currentVersion, {
      title: true,
      content: true,
      summary: true,
      tags: true,
      previousVersion: {
        title: doc.title,
        content: doc.content,
        summary: doc.summary,
        tags: doc.tags
      },
      newVersion: {
        title: versionToRestore.title,
        content: versionToRestore.content,
        summary: versionToRestore.summary,
        tags: versionToRestore.tags
      }
    });
    
    await session.commitTransaction();
    session.endSession();
    
    // Return the restored document
    const updatedDoc = await Document.findById(doc._id)
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .populate('versions.editedBy', 'name email');
    
    res.json({
      message: 'Document restored to the selected version',
      document: updatedDoc
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error restoring document version:', err);
    res.status(500).json({ message: 'Failed to restore document version', error: err.message });
  }
};
