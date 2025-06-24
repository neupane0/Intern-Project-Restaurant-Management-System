// controllers/billController.js
const asyncHandler = require('express-async-handler');
const Bill = require('../models/Bill');
const Order = require('../models/Order');
const Dish = require('../models/Dish');

// @desc    Generate a bill for a completed order
// @route   POST /api/bills/:orderId
// @access  Private/Admin
const generateBill = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId)
        .populate('items.dish'); // Populate dish details to get price

    if (!order) {
        res.status(404);
        throw new Error('Order not found');
    }

    if (order.isBilled) {
        res.status(400);
        throw new Error('This order has already been billed');
    }

    // Only accepted items are billed
    const billedItems = [];
    let totalAmount = 0;

    for (const item of order.items) {
        if (item.status === 'accepted') {
            billedItems.push({
                dish: item.dish._id,
                quantity: item.quantity,
                price: item.dish.price // Use the current price from the dish model
            });
            totalAmount += item.quantity * item.dish.price;
        }
    }

    if (billedItems.length === 0) {
        res.status(400);
        throw new Error('No accepted dishes in this order to bill');
    }

    const bill = new Bill({
        order: order._id,
        billedBy: req.user._id, // The logged-in admin
        items: billedItems,
        totalAmount: totalAmount,
        paymentStatus: 'pending'
    });

    const createdBill = await bill.save();

    // Mark the order as billed
    order.isBilled = true;
    // Optionally, if not already, set order status to completed when billed
    if (order.orderStatus !== 'completed') {
         order.orderStatus = 'completed';
    }
    await order.save();

    res.status(201).json(createdBill);
});

// @desc    Get all bills (Admin)
// @route   GET /api/bills
// @access  Private/Admin
const getBills = asyncHandler(async (req, res) => {
    const bills = await Bill.find({})
        .populate('order', 'tableNumber orderStatus')
        .populate('billedBy', 'name');
    res.json(bills);
});

// @desc    Get single bill by ID
// @route   GET /api/bills/:id
// @access  Private/Admin
const getBillById = asyncHandler(async (req, res) => {
    const bill = await Bill.findById(req.params.id)
        .populate('order', 'tableNumber orderStatus')
        .populate('billedBy', 'name');
    if (bill) {
        res.json(bill);
    } else {
        res.status(404);
        throw new Error('Bill not found');
    }
});

// @desc    Update payment status of a bill
// @route   PUT /api/bills/:id/pay
// @access  Private/Admin
const updateBillPaymentStatus = asyncHandler(async (req, res) => {
    const { paymentStatus } = req.body; // 'paid', 'refunded'
    const bill = await Bill.findById(req.params.id);

    if (bill) {
        if (!['paid', 'refunded'].includes(paymentStatus)) {
            res.status(400);
            throw new Error('Invalid payment status');
        }
        bill.paymentStatus = paymentStatus;
        const updatedBill = await bill.save();
        res.json(updatedBill);
    } else {
        res.status(404);
        throw new Error('Bill not found');
    }
});

// @desc    Get Daily Sales Report
// @route   GET /api/reports/sales/daily
// @access  Private/Admin
const getDailySalesReport = asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Start of tomorrow

    const dailySales = await Bill.aggregate([
        {
            $match: {
                billDate: { $gte: today, $lt: tomorrow },
                paymentStatus: 'paid'
            }
        },
        {
            $group: {
                _id: null,
                totalSales: { $sum: '$totalAmount' },
                totalBills: { $sum: 1 }
            }
        }
    ]);
    res.json(dailySales[0] || { totalSales: 0, totalBills: 0 });
});

// @desc    Get Monthly Sales Report
// @route   GET /api/reports/sales/monthly
// @access  Private/Admin
const getMonthlySalesReport = asyncHandler(async (req, res) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // End of current month

    const monthlySales = await Bill.aggregate([
        {
            $match: {
                billDate: { $gte: startOfMonth, $lte: endOfMonth },
                paymentStatus: 'paid'
            }
        },
        {
            $group: {
                _id: null,
                totalSales: { $sum: '$totalAmount' },
                totalBills: { $sum: 1 }
            }
        }
    ]);
    res.json(monthlySales[0] || { totalSales: 0, totalBills: 0 });
});

// @desc    Get Most Ordered Dishes
// @route   GET /api/reports/dishes/most-ordered
// @access  Private/Admin
const getMostOrderedDishes = asyncHandler(async (req, res) => {
    const mostOrdered = await Bill.aggregate([
        {
            $match: {
                paymentStatus: 'paid' // Only count from paid bills
            }
        },
        { $unwind: '$items' }, // Deconstruct the items array
        {
            $group: {
                _id: '$items.dish', // Group by dish ID
                totalQuantity: { $sum: '$items.quantity' }
            }
        },
        { $sort: { totalQuantity: -1 } }, // Sort by quantity, descending
        { $limit: 10 }, // Top 10 most ordered
        {
            $lookup: { // Join with Dish collection to get dish name
                from: 'dishes', // The collection name in MongoDB (usually pluralized model name)
                localField: '_id',
                foreignField: '_id',
                as: 'dishInfo'
            }
        },
        { $unwind: '$dishInfo' }, // Deconstruct the dishInfo array
        {
            $project: { // Project only necessary fields
                _id: 0,
                dishName: '$dishInfo.name',
                totalQuantity: 1
            }
        }
    ]);
    res.json(mostOrdered);
});


module.exports = {
    generateBill,
    getBills,
    getBillById,
    updateBillPaymentStatus,
    getDailySalesReport,
    getMonthlySalesReport,
    getMostOrderedDishes
};