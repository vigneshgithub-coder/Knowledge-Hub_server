const Document = require('../models/Document');
const { answerQuestion } = require('../utils/gemini');

exports.teamQA = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ message: 'Question is required' });

    // For context, use the most recent docs
    const docs = await Document.find({}).sort({ updatedAt: -1 }).limit(10);
    const answer = await answerQuestion(question, docs);
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ message: 'Q&A failed', error: err.message });
  }
};
