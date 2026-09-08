const express = require('express');
const router = express.Router();
const { createWebhook, getWebhooks, deleteWebhook } = require('../controllers/webhookController');
const { protect } = require('../middleware/authMiddleware');

// All webhook routes require JWT authentication
router.use(protect);

router.post('/', createWebhook);
router.get('/', getWebhooks);
router.delete('/:id', deleteWebhook);

module.exports = router;
