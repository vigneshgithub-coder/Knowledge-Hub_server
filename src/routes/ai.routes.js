const router = require('express').Router();
const { teamQA } = require('../controllers/ai.controller');
const { authenticate } = require('../middleware/auth');

// Team Q&A using stored documents as context
router.post('/qa', authenticate, teamQA);

module.exports = router;
