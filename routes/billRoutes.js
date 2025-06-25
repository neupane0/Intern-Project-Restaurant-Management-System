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
    getMostOrderedDishes,
    // *** FIX: Add the new report functions here ***
    getStoredReports,
    getStoredReportById,
    deleteStoredReport,
} = require('../controllers/billController'); // Ensure these are exported from billController.js
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

// --- NEW ROUTES for Stored Reports (Admin only) ---
// These routes were added in a previous step to handle the new Report model
router.route('/reports/stored')
    .get(protect, authorizeRoles('admin'), getStoredReports); // GET all stored reports

router.route('/reports/stored/:id')
    .get(protect, authorizeRoles('admin'), getStoredReportById) // GET a specific stored report by ID
    .delete(protect, authorizeRoles('admin'), deleteStoredReport); // DELETE a specific stored report by ID


module.exports = router;