// routes/billRoutes.js
const express = require('express');
const router = express.Router();
const {
    generateBill,
    getBills,
    getBillById,
    updateBillPaymentStatus,
    getDailySalesReport,
    getMonthlySalesReport,
    getMostOrderedDishes
} = require('../controllers/billController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Billing routes (Admin only)
router.post('/:orderId', protect, authorizeRoles('admin'), generateBill);
router.route('/')
    .get(protect, authorizeRoles('admin'), getBills);
router.route('/:id')
    .get(protect, authorizeRoles('admin'), getBillById)
    .put(protect, authorizeRoles('admin'), updateBillPaymentStatus);

// Reporting routes (Admin only)
router.get('/reports/sales/daily', protect, authorizeRoles('admin'), getDailySalesReport);
router.get('/reports/sales/monthly', protect, authorizeRoles('admin'), getMonthlySalesReport);
router.get('/reports/dishes/most-ordered', protect, authorizeRoles('admin'), getMostOrderedDishes);


module.exports = router;