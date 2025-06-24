// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const {
    createOrder,
    getOrders,
    getOrderById,
    updateOrderItemStatus,
    updateOrderStatus,
    cancelOrder
} = require('../controllers/orderController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, authorizeRoles('waiter'), createOrder)
    .get(protect, authorizeRoles('admin', 'chef', 'waiter'), getOrders); // Waiter can only see their own orders based on controller logic

router.route('/:id')
    .get(protect, authorizeRoles('admin', 'chef', 'waiter'), getOrderById);

// Chef specific routes for order items
router.put('/:orderId/item/:itemId/status', protect, authorizeRoles('chef'), updateOrderItemStatus);

// Chef/Admin update overall order status
router.put('/:id/status', protect, authorizeRoles('chef', 'admin'), updateOrderStatus);

// Waiter/Admin cancel order
router.put('/:id/cancel', protect, authorizeRoles('waiter', 'admin'), cancelOrder);


module.exports = router;