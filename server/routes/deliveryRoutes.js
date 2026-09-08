const express = require('express');
const router = express.Router();
const { getDeliveries, getDeliveryById } = require('../controllers/deliveryController');
const { protect } = require('../middleware/authMiddleware');

// All delivery routes require JWT authentication
router.use(protect);

router.get('/', getDeliveries);
router.get('/:id', getDeliveryById);

module.exports = router;
