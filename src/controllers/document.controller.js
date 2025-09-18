const Document = require('../models/Document');
const Activity = require('../models/Activity');
const { summarizeText, generateTags, embedText } = require('../utils/gemini');

// Helpers
function canModify(user, doc) {
  return user.role === 'admin' || String(doc.createdBy) === String(user._id);
}

exports.createDocument = async (req, res) => {
  try {
    const { title, content, tags } = req.body;
    if (!title || !content) return res.status(400).json({ message: 'Title and content are required' });

    // Debug logging for incoming data and user context
    try {
      console.log('[createDocument] Incoming payload:', {
        title,
        contentLength: typeof content === 'string' ? content.length : null,
        tags,
      });
      console.log('[createDocument] Authenticated user:', {
        id: req.user?._id,
        email: req.user?.email,
        role: req.user?.role,
      });
    } catch (_) {
      // avoid crashing on logging
    }

    // AI assist
    const [summary, autoTags, embedding] = await Promise.all([
      summarizeText(content),
      generateTags(`${title}\n${content}`, 6),
      embedText(`${title}\n${content}`),
    ]);

    // Debug logging for AI outputs (sizes only to avoid dumping huge data)
    try {
      console.log('[createDocument] AI outputs:', {
        summaryLength: typeof summary === 'string' ? summary.length : null,
        autoTags,
        embeddingLength: Array.isArray(embedding) ? embedding.length : null,
      });
    } catch (_) {}

    const doc = await Document.create({
      title,
      content,
      summary,
      tags: Array.from(new Set([...(tags || []), ...autoTags])).slice(0, 10),
      embedding,
      createdBy: req.user._id,
      versions: [],
    });

    await Activity.create({ action: 'created', document: doc._id, user: req.user._id });

    res.status(201).json(doc);
  } catch (err) {
    // Log full error for debugging
    console.error('CreateDocument error:', err && err.stack ? err.stack : err);
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
  try {
    const { title, content, tags } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canModify(req.user, doc)) return res.status(403).json({ message: 'Forbidden' });

    // Save version
    doc.versions.push({
      title: doc.title,
      content: doc.content,
      summary: doc.summary,
      tags: doc.tags,
      editedBy: req.user._id,
    });

    if (title !== undefined) doc.title = title;
    if (content !== undefined) doc.content = content;
    if (tags !== undefined) doc.tags = tags;

    // Recompute AI fields if content/title changed
    if (title !== undefined || content !== undefined) {
      const [summary, autoTags, embedding] = await Promise.all([
        summarizeText(doc.content),
        generateTags(`${doc.title}\n${doc.content}`, 6),
        embedText(`${doc.title}\n${doc.content}`),
      ]);
      doc.summary = summary;
      doc.embedding = embedding;
      if (!tags) {
        doc.tags = Array.from(new Set([...(doc.tags || []), ...autoTags])).slice(0, 10);
      }
    }

    await doc.save();
    await Activity.create({ action: 'updated', document: doc._id, user: req.user._id });

    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update document', error: err.message });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canModify(req.user, doc)) return res.status(403).json({ message: 'Forbidden' });
    await doc.deleteOne();
    await Activity.create({ action: 'deleted', document: doc._id, user: req.user._id });
    res.json({ success: true });
  } catch (err) {
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

exports.activityFeed = async (_req, res) => {
  try {
    const items = await Activity.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name email')
      .populate('document', 'title');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch activity', error: err.message });
  }
};
