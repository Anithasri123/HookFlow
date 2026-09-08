const express = require('express');
const router = express.Router();
const { createEvent, getEvents, getEventById } = require('../controllers/eventController');
const { protect } = require('../middleware/authMiddleware');

// All event routes require JWT authentication
router.use(protect);

router.post('/', createEvent);
router.get('/', getEvents);
router.get('/:id', getEventById);

module.exports = router;
