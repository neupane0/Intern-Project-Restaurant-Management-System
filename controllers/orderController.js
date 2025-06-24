// controllers/orderController.js
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Dish = require('../models/Dish'); // To get dish price

// @desc    Create a new order
// @route   POST /api/orders
// @access  Private/Waiter
const createOrder = asyncHandler(async (req, res) => {
    const { tableNumber, items } = req.body; // items: [{ dishId: '...', quantity: N }]

    if (!items || items.length === 0) {
        res.status(400);
        throw new Error('No order items provided');
    }

    // Validate dishes and get their prices for initial total (might change after chef accepts)
    const orderItems = [];
    let initialTotal = 0;

    for (const item of items) {
        const dish = await Dish.findById(item.dishId);
        if (!dish || !dish.isAvailable) {
            res.status(404);
            throw new Error(`Dish not found or unavailable: ${item.dishId}`);
        }
        orderItems.push({
            dish: dish._id,
            quantity: item.quantity,
            status: 'pending' // Default status for new items
        });
        initialTotal += dish.price * item.quantity;
    }

    const order = new Order({
        tableNumber,
        waiter: req.user._id, // The logged-in waiter
        items: orderItems,
        totalAmount: initialTotal, // This will be recalculated when billed
        orderStatus: 'pending'
    });

    const createdOrder = await order.save();
    res.status(201).json(createdOrder);
});

// @desc    Get all orders (for Admin, Chef)
// @route   GET /api/orders
// @access  Private/Admin, Chef (and potentially Waiter for their own orders)
const getOrders = asyncHandler(async (req, res) => {
    let query = {};

    // Filter by waiter for waiter role
    if (req.user.role === 'waiter') {
        query.waiter = req.user._id;
    }
    // Filter by orderStatus for chef
    if (req.user.role === 'chef') {
        // Chef usually needs 'pending' or 'preparing' orders
        query.orderStatus = { $in: ['pending', 'preparing'] };
    }

    const orders = await Order.find(query)
        .populate('waiter', 'name email')
        .populate('items.dish', 'name price');
    res.json(orders);
});

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private/Admin, Chef, Waiter (if it's their order)
const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
        .populate('waiter', 'name email')
        .populate('items.dish', 'name price');

    if (order) {
        // Ensure only relevant users can view
        if (req.user.role === 'waiter' && order.waiter.toString() !== req.user._id.toString()) {
            res.status(403);
            throw new Error('Not authorized to view this order');
        }
        res.json(order);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Chef accepts/declines a specific dish in an order
// @route   PUT /api/orders/:orderId/item/:itemId/status
// @access  Private/Chef
const updateOrderItemStatus = asyncHandler(async (req, res) => {
    const { orderId, itemId } = req.params;
    const { status } = req.body; // 'accepted' or 'declined'

    const order = await Order.findById(orderId);

    if (order) {
        const item = order.items.id(itemId); // Mongoose subdocument .id()
        if (item) {
            if (!['accepted', 'declined'].includes(status)) {
                res.status(400);
                throw new Error('Invalid item status');
            }
            item.status = status;

            // Optionally, update overall order status if all items are processed
            const allItemsProcessed = order.items.every(i => i.status !== 'pending');
            if (allItemsProcessed && order.orderStatus === 'pending') {
                order.orderStatus = 'preparing'; // Or 'ready' if all accepted immediately
            }

            await order.save();
            res.json(order);
        } else {
            res.status(404);
            throw new Error('Order item not found');
        }
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Chef updates overall order status (e.g., preparing, ready)
// @route   PUT /api/orders/:id/status
// @access  Private/Chef
const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body; // e.g., 'preparing', 'ready', 'completed' (admin might do this)

    const order = await Order.findById(req.params.id);

    if (order) {
        if (!['preparing', 'ready', 'completed', 'cancelled'].includes(status)) {
            res.status(400);
            throw new Error('Invalid order status');
        }
        order.orderStatus = status;

        // If order is completed, mark it as ready for billing if not already
        if (status === 'completed' && !order.isBilled) {
            // Logic to trigger bill generation or prepare for it
            // This will be handled more robustly in billController
        }

        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Cancel an order (Waiter/Admin)
// @route   PUT /api/orders/:id/cancel
// @access  Private/Waiter, Admin
const cancelOrder = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (order) {
        if (order.orderStatus === 'completed' || order.orderStatus === 'cancelled' || order.isBilled) {
            res.status(400);
            throw new Error('Cannot cancel a completed, already cancelled, or billed order');
        }
        order.orderStatus = 'cancelled';
        await order.save();
        res.json({ message: 'Order cancelled successfully' });
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});


module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrderItemStatus,
    updateOrderStatus,
    cancelOrder
};