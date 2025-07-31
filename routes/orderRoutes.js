// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const {
    createOrder,
    getOrders,
    getOrderById,
    updateOrderItemStatus,
    updateOrderStatus,
    cancelOrder,
    requestItemCancellation,
    manageItemCancellation, 
} = require('../controllers/orderController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Base routes for orders
router.route('/')
    .post(protect, authorizeRoles('waiter', 'admin'), createOrder) // Waiter or Admin can create orders
    .get(protect, authorizeRoles('admin', 'chef', 'waiter'), getOrders); // Admin sees all, Chef sees kitchen relevant, Waiter sees own

// Routes for specific order by ID
router.route('/:id')
    .get(protect, authorizeRoles('admin', 'chef', 'waiter'), getOrderById) // Get single order
    .put(protect, authorizeRoles('admin', 'chef'), updateOrderStatus) // Update overall order status
    .put(protect, authorizeRoles('waiter', 'admin'), cancelOrder); // Cancel entire order (Waiters can only cancel their own)

// Route to update individual order item status (for chef)
router.put('/:orderId/item/:itemId/status', protect, authorizeRoles('chef'), updateOrderItemStatus);

// Route to request cancellation for an individual order item (by Waiter)
router.put('/:orderId/item/:itemId/request-cancellation', protect, authorizeRoles('waiter', 'admin'), requestItemCancellation);

// Admin manages (approves/rejects) item cancellation requests
// PUT /api/orders/:orderId/item/:itemId/manage-cancellation
router.put('/:orderId/item/:itemId/manage-cancellation', protect, authorizeRoles('admin'), manageItemCancellation);


module.exports = router;
