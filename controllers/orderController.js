// controllers/orderController.js
const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Dish = require("../models/Dish");

// @desc    Create a new order
// @route   POST /api/orders
// @access  Private (Waiter/Admin)
const createOrder = asyncHandler(async (req, res) => {
  const { tableNumber, customerName, customerPhoneNumber, items } = req.body;

  if (
    !tableNumber ||
    !customerName ||
    !customerPhoneNumber ||
    !items ||
    items.length === 0
  ) {
    res.status(400);
    throw new Error(
      "Please provide table number, customer details, and at least one item."
    );
  }

  // Validate and prepare order items
  const orderItems = [];
  for (const item of items) {
    const dish = await Dish.findById(item.dish);
    if (!dish) {
      res.status(404);
      throw new Error(`Dish with ID ${item.dish} not found.`);
    }
    if (item.quantity <= 0) {
      res.status(400);
      throw new Error(`Quantity for dish ${dish.name} must be at least 1.`);
    }
    orderItems.push({
      dish: item.dish,
      quantity: item.quantity,
      status: "pending", // Default status for new items
      notes: item.notes || "", // Capture notes for the item
    });
  }

  const order = await Order.create({
    tableNumber,
    waiter: req.user._id, // The authenticated user (waiter or admin)
    customerName,
    customerPhoneNumber,
    items: orderItems,
    orderStatus: "pending",
    // totalAmount will be calculated by the pre-save hook in the Order model
  });

  // Populate dish details for the response
  const populatedOrder = await Order.findById(order._id)
    .populate("waiter", "name email")
    .populate("items.dish", "name price");

  res.status(201).json(populatedOrder);
});

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private (Admin/Chef/Waiter)
const getOrders = asyncHandler(async (req, res) => {
  const { role } = req.user;
  let query = {};

  if (role === "chef") {
    // Chefs see orders that are pending, preparing, or ready
    query.orderStatus = { $in: ["pending", "preparing", "ready"] };
  } else if (role === "waiter") {
    // Waiters see only their own orders
    query.waiter = req.user._id;
  }
  // Admin sees all orders (no specific query needed)

  const orders = await Order.find(query)
    .populate("waiter", "name email")
    .populate("items.dish", "name price")
    .sort({ createdAt: -1 }); // Latest orders first

  res.json(orders);
});

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private (Admin/Chef/Waiter - only their own)
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("waiter", "name email")
    .populate("items.dish", "name price");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Authorization check: Waiters can only view their own orders
  if (
    req.user.role === "waiter" &&
    order.waiter.toString() !== req.user._id.toString()
  ) {
    res.status(403); // Forbidden
    throw new Error("Not authorized to view this order");
  }

  res.json(order);
});

// @desc    Update individual order item status (for chef)
// @route   PUT /api/orders/:orderId/item/:itemId/status
// @access  Private (Chef)
const updateOrderItemStatus = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { status } = req.body; // Expected status: 'accepted', 'declined', 'preparing', 'ready'

  const order = await Order.findById(orderId);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Find the specific item within the order's items array
  const item = order.items.id(itemId); // Mongoose subdocument .id() method

  if (!item) {
    res.status(404);
    throw new Error("Order item not found");
  }

  // Validate new status
  //  Added 'cancellation_requested' to valid statuses for chef to manage
  const validItemStatuses = [
    "accepted",
    "declined",
    "preparing",
    "ready",
    "cancelled",
    "cancellation_requested",
  ];
  if (!validItemStatuses.includes(status)) {
    res.status(400);
    throw new Error("Invalid item status provided");
  }

  // Prevent changing status if order is already completed or cancelled
  if (
    order.orderStatus === "completed" ||
    order.orderStatus === "cancelled" ||
    order.isBilled
  ) {
    res.status(400);
    throw new Error(
      `Cannot change item status for an order that is ${order.orderStatus} or already billed.`
    );
  }

  item.status = status;

  // After updating item status, re-evaluate overall order status
  let allItemsProcessed = true; // All items are either accepted, declined, ready, or cancelled
  let anyItemsAccepted = false; // At least one item is accepted
  let allItemsReady = true; // All accepted items are ready

  for (const orderItem of order.items) {
    if (orderItem.status === "pending") {
      allItemsProcessed = false;
    }
    if (orderItem.status === "accepted") {
      anyItemsAccepted = true;
    }
    if (orderItem.status === "accepted" && orderItem.status !== "ready") {
      allItemsReady = false;
    }
  }

  if (allItemsProcessed && anyItemsAccepted) {
    order.orderStatus = "preparing"; // If all items are processed and at least one is accepted
  }
  if (allItemsReady && anyItemsAccepted) {
    order.orderStatus = "ready"; // If all accepted items are ready
  }
  // If all items are declined or cancelled, order status might become cancelled (handled by cancelOrder or cancelOrderItem)

  const updatedOrder = await order.save(); // This will trigger the pre-save hook for totalAmount

  // Populate dish details for the response
  const populatedOrder = await Order.findById(updatedOrder._id)
    .populate("waiter", "name email")
    .populate("items.dish", "name price");

  res.json(populatedOrder);
});

// @desc    Update overall order status (for chef/admin)
// @route   PUT /api/orders/:id/status
// @access  Private (Chef/Admin)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body; // Expected status: 'preparing', 'ready', 'completed', 'cancelled'

  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Prevent status change if already billed or completed/cancelled
  if (
    order.isBilled ||
    order.orderStatus === "completed" ||
    order.orderStatus === "cancelled"
  ) {
    res.status(400);
    throw new Error(
      `Cannot change status for an order that is already billed, completed, or cancelled.`
    );
  }

  // Validate status transition (simplified)
  const validTransitions = {
    pending: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["completed", "cancelled"],
    // 'completed' and 'cancelled' are final states
  };

  if (
    !validTransitions[order.orderStatus] ||
    !validTransitions[order.orderStatus].includes(status)
  ) {
    res.status(400);
    throw new Error(
      `Invalid status transition from "${order.orderStatus}" to "${status}".`
    );
  }

  order.orderStatus = status;
  const updatedOrder = await order.save();

  res.json(updatedOrder);
});

// @desc    Cancel an entire order
// @route   PUT /api/orders/:id/cancel
// @access  Private (Waiter/Admin)
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Prevent cancellation if already billed or completed
  if (order.isBilled || order.orderStatus === "completed") {
    res.status(400);
    throw new Error(
      "Cannot cancel an order that is already billed or completed."
    );
  }

  // Waiters can only cancel their own pending orders
  if (
    req.user.role === "waiter" &&
    order.waiter.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error("Not authorized to cancel this order.");
  }

  order.orderStatus = "cancelled";
  // Mark all items as cancelled as well
  order.items.forEach((item) => {
    if (item.status !== "declined") {
      // Don't override already declined items
      item.status = "cancelled";
    }
  });

  const updatedOrder = await order.save(); // This will trigger pre-save hook to recalculate totalAmount to 0

  res.json(updatedOrder);
});

// @desc    Request cancellation for an individual order item (by Waiter)
// @route   PUT /api/orders/:orderId/item/:itemId/request-cancellation
// @access  Private (Waiter/Admin)
const requestItemCancellation = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;

  const order = await Order.findById(orderId);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const item = order.items.id(itemId);

  if (!item) {
    res.status(404);
    throw new Error("Order item not found");
  }

  // Prevent request if order is completed, billed, or item is already cancelled/ready
  if (
    order.orderStatus === "completed" ||
    order.isBilled ||
    item.status === "cancelled" ||
    item.status === "ready"
  ) {
    res.status(400);
    throw new Error(
      `Cannot request cancellation for item in "${item.status}" status or for a ${order.orderStatus} order.`
    );
  }

  // Waiters can only request cancellation for items in their own orders
  if (
    req.user.role === "waiter" &&
    order.waiter.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error(
      "Not authorized to request cancellation for items in this order."
    );
  }

  // Set item status to 'cancellation_requested'
  item.status = "cancellation_requested";

  const updatedOrder = await order.save();

  const populatedOrder = await Order.findById(updatedOrder._id)
    .populate("waiter", "name email")
    .populate("items.dish", "name price");

  res.json(populatedOrder);
});

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderItemStatus,
  updateOrderStatus,
  cancelOrder,
  requestItemCancellation,
};
