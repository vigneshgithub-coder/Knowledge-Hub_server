const router = require('express').Router();
const { textSearch, semanticSearch } = require('../controllers/search.controller');
const { authenticate } = require('../middleware/auth');

router.get('/text', authenticate, textSearch);
router.get('/semantic', authenticate, semanticSearch);

module.exports = router;
