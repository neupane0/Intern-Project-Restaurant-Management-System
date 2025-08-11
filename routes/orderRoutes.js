// routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderItemStatus,
  updateOrderStatus,
  cancelOrder,
} = require("../controllers/orderController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit"); // <--- NEW: Import rateLimit

// Define a rate limiter for order creation
const createOrderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 3, // Allow 3 requests per IP per window
  message:
    "Too many orders placed from this IP, please try again after a minute.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Base /api/orders route
router
  .route("/")
  // POST /api/orders: Create a new order (Waiter or Admin only)
  // Apply the rate limiter here
  .post(
    protect,
    authorizeRoles("waiter", "admin"),
    createOrderLimiter,
    createOrder
  ) // <--- UPDATED
  // GET /api/orders: Get all orders (Admin, Chef, or Waiter - Waiter gets only their own as per controller)
  .get(protect, authorizeRoles("admin", "chef", "waiter"), getOrders);
router.get("/kds", protect, authorizeRoles("chef", "admin"), getKDSOrders);
// Individual order routes by ID
router
  .route("/:id")
  // GET /api/orders/:id: Get a specific order (Admin, Chef, or Waiter - Waiter gets only their own as per controller)
  .get(protect, authorizeRoles("admin", "chef", "waiter"), getOrderById);

// Chef-specific route to update the status of an individual item within an order
// PUT /api/orders/:orderId/item/:itemId/status
router.put(
  "/:orderId/item/:itemId/status",
  protect,
  authorizeRoles("chef"),
  updateOrderItemStatus
);

// Chef/Admin route to update the overall order status
// PUT /api/orders/:id/status
router.put(
  "/:id/status",
  protect,
  authorizeRoles("chef", "admin"),
  updateOrderStatus
);

// Waiter/Admin route to cancel an order
// PUT /api/orders/:id/cancel
router.put(
  "/:id/cancel",
  protect,
  authorizeRoles("waiter", "admin"),
  cancelOrder
);

module.exports = router;
