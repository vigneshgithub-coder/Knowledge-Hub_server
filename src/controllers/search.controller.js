const Document = require('../models/Document');
const { embedText, cosineSim } = require('../utils/gemini');

exports.textSearch = async (req, res) => {
  try {
    const { q = '', limit = 20, page = 1 } = req.query;
    const filter = q
      ? {
          $or: [
            { title: { $regex: q, $options: 'i' } },
            { content: { $regex: q, $options: 'i' } },
            { tags: { $regex: q, $options: 'i' } },
          ],
        }
      : {};

    const docs = await Document.find(filter)
      .sort({ updatedAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Text search failed', error: err.message });
  }
};

exports.semanticSearch = async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;
    if (!q) return res.status(400).json({ message: 'Missing query' });

    const qEmbedding = await embedText(q);

    // For demo, scan a reasonable subset (e.g., latest 200)
    const pool = await Document.find({}).sort({ updatedAt: -1 }).limit(200);
    const ranked = pool
      .map((d) => ({ doc: d, score: cosineSim(qEmbedding, d.embedding || []) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Number(limit))
      .map(({ doc, score }) => ({ ...doc.toObject(), _score: score }));

    res.json(ranked);
  } catch (err) {
    res.status(500).json({ message: 'Semantic search failed', error: err.message });
  }
};
