// routes/billRoutes.js
const express = require("express");
const router = express.Router();
const {
  generateBill,
  getBills,
  getBillById,
  updateBillPaymentStatus,
  splitBill, // *** NEW: Import splitBill function ***
  getDailySalesReport,
  getMonthlySalesReport,
  getMostOrderedDishes,
  getStoredReports,
  getStoredReportById,
  deleteStoredReport,
} = require("../controllers/billController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// Route to generate a bill for a specific order (original bill)
// POST /api/bills/:orderId
router.route("/:orderId").post(protect, authorizeRoles("admin"), generateBill);

// Routes to get all bills and specific bill by ID
router.route("/").get(protect, authorizeRoles("admin"), getBills); // GET /api/bills

router.route("/:id").get(protect, authorizeRoles("admin"), getBillById); // GET /api/bills/:id

// Route to update payment status of a bill
// PUT /api/bills/:id/pay
router
  .route("/:id/pay")
  .put(protect, authorizeRoles("admin"), updateBillPaymentStatus);

// --- NEW ROUTE FOR SPLIT BILL FUNCTIONALITY ---
// POST /api/bills/:orderId/split
// Accessible by 'admin' role
router
  .route("/:orderId/split")
  .post(protect, authorizeRoles("admin"), splitBill);

// Sales Report Routes (Admin only)
router
  .route("/reports/sales/daily")
  .get(protect, authorizeRoles("admin"), getDailySalesReport);
router
  .route("/reports/sales/monthly")
  .get(protect, authorizeRoles("admin"), getMonthlySalesReport);
router
  .route("/reports/dishes/most-ordered")
  .get(protect, authorizeRoles("admin"), getMostOrderedDishes);

// Routes for Stored Reports (Admin only)
router
  .route("/reports/stored")
  .get(protect, authorizeRoles("admin"), getStoredReports);

router
  .route("/reports/stored/:id")
  .get(protect, authorizeRoles("admin"), getStoredReportById)
  .delete(protect, authorizeRoles("admin"), deleteStoredReport);

module.exports = router;
