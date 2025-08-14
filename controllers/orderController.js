// controllers/orderController.js
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Dish = require('../models/Dish');

// @desc    Create a new order
// @route   POST /api/orders
// @access  Private/Waiter
const createOrder = asyncHandler(async (req, res) => {
    const { items, tableNumber, customerName, customerPhoneNumber } = req.body;

    // 1. Basic input validation
    if (!tableNumber) {
        res.status(400);
        throw new Error('Table number is required to create an order.');
    }
    if (!items || items.length === 0) {
        res.status(400);
        throw new Error('No order items provided.');
    }
    if (!customerName) {
        res.status(400);
        throw new Error('Customer name is required for the order.');
    }
    if (!customerPhoneNumber) {
        res.status(400);
        throw new Error('Customer phone number is required.');
    }

    const orderItems = [];
    let initialTotal = 0;
    const today = new Date();

    // 2. Validate each item and create a dish "snapshot"
    // This is the core logic that captures the dish details at the time of the order.
    for (const item of items) {
        if (!item.dish || !item.quantity) {
            res.status(400);
            throw new Error('Each order item must specify a dish ID and quantity.');
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
            res.status(400);
            throw new Error('Item quantity must be a positive number.');
        }

        const dish = await Dish.findById(item.dish);
        if (!dish || !dish.isAvailable) {
            res.status(404);
            throw new Error(`Dish not found or unavailable: ${item.dish}`);
        }

        // Determine the price to use: special price if applicable, otherwise the regular price.
        let priceToUse = dish.price;
        if (
            dish.isSpecial &&
            dish.specialPrice !== undefined &&
            dish.specialStartDate &&
            dish.specialEndDate
        ) {
            const specialStart = new Date(dish.specialStartDate);
            const specialEnd = new Date(dish.specialEndDate);

            if (today >= specialStart && today <= specialEnd) {
                priceToUse = dish.specialPrice;
            }
        }

        // Create a new order item with the dish snapshot. This is the new, self-contained item.
        orderItems.push({
            dish: dish._id,
            name: dish.name,
            description: dish.description,
            category: dish.category,
            price: priceToUse, // Store the final price (special or regular)
            quantity: item.quantity,
            status: 'pending'
        });
        initialTotal += priceToUse * item.quantity;
    }

    // 3. Create the order document with the correct initial total
    const order = new Order({
        tableNumber,
        customerName,
        customerPhoneNumber,
        waiter: req.user._id,
        items: orderItems,
        totalAmount: initialTotal,
        orderStatus: 'pending'
    });

    const createdOrder = await order.save();

    // 4. The populated data is already in the document, so we only need to populate the waiter.
    const populatedOrder = await Order.findById(createdOrder._id)
                                    .populate('waiter', 'name email');

    res.status(201).json(populatedOrder);
});

// @desc    Get all orders (for Admin, Chef, Waiter)
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
        query.orderStatus = { $in: ['pending', 'preparing'] };
    }

    // We no longer need to populate 'items.dish' because the data is now a snapshot.
    const orders = await Order.find(query)
        .populate('waiter', 'name email');
    res.json(orders);
});

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private/Admin, Chef, Waiter (if it's their order)
const getOrderById = asyncHandler(async (req, res) => {
    // We no longer need to populate 'items.dish' here either.
    const order = await Order.findById(req.params.id)
        .populate('waiter', 'name email');

    if (order) {
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
    const { status } = req.body;

    const order = await Order.findById(orderId);

    if (order) {
        const item = order.items.id(itemId);
        if (item) {
            if (!['accepted', 'declined'].includes(status)) {
                res.status(400);
                throw new Error('Invalid item status');
            }
            item.status = status;

            const allItemsProcessed = order.items.every(i => i.status !== 'pending');
            if (allItemsProcessed && order.orderStatus === 'pending') {
                order.orderStatus = 'preparing';
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
    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    if (order) {
        if (!['preparing', 'ready', 'completed', 'cancelled'].includes(status)) {
            res.status(400);
            throw new Error('Invalid order status');
        }
        order.orderStatus = status;

        if (status === 'completed' && !order.isBilled) {
            // This is where you would traditionally signal to generate a bill
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