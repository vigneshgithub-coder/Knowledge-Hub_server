const router = require('express').Router();
const {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  forceSummarize,
  forceTags,
  activityFeed,
} = require('../controllers/document.controller');
const { authenticate } = require('../middleware/auth');

// Activity feed (dashboard sidebar)
router.get('/activity', authenticate, activityFeed);

// CRUD
router.post('/', authenticate, createDocument);
router.get('/', authenticate, getDocuments);
router.get('/:id', authenticate, getDocumentById);
router.put('/:id', authenticate, updateDocument);
router.delete('/:id', authenticate, deleteDocument);

// AI actions
router.post('/:id/summarize', authenticate, forceSummarize);
router.post('/:id/tags', authenticate, forceTags);

module.exports = router;
