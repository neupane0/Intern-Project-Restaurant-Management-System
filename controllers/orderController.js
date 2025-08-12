// controllers/orderController.js
const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Dish = require("../models/Dish"); // To get dish price
const { sendWhatsAppMessage } = require("../utils/whatsappService");
const User = require("../models/User");

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
  let initialTotal = 0;

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
    initialTotal += dish.price * item.quantity;
  }

  // 3. Create the order document
  const order = new Order({
    tableNumber,
    customerName,
    customerPhoneNumber,
    waiter: req.user._id, // The logged-in waiter
    items: orderItems,
    totalAmount: initialTotal,
    orderStatus: "pending",
    timestamps: {
      // --- NEW: Set initial pending timestamp ---
      pending: new Date(),
    },
  });

  const createdOrder = await order.save(); // The pre-save hook on Order model will run here

  // 4. Respond with the created order, populating dish details for the client
  const populatedOrder = await Order.findById(createdOrder._id)
    .populate({
      path: "items.dish",
      select: "name price description category",
    })
    .populate("waiter", "name email");

  res.status(201).json(populatedOrder);
});

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private (Admin/Chef/Waiter)
const getOrders = asyncHandler(async (req, res) => {
  const { role } = req.user;
  let query = {};

  if (role === "chef") {
    query.orderStatus = { $in: ["pending", "preparing", "ready"] };
    query["items.status"] = {
      $in: [
        "pending",
        "accepted",
        "declined",
        "preparing",
        "ready",
        "cancellation_requested",
      ],
    };
  } else if (role === "waiter") {
    query.waiter = req.user._id;
  }

  const orders = await Order.find(query)
    .populate("waiter", "name email")
    .populate("items.dish", "name price")
    .sort({ createdAt: -1 });

  res.json(orders);
});

// --- NEW: Get all orders for KDS (Kitchen Display System) ---
// @desc    Get orders for the KDS (Kitchen Display System)
// @route   GET /api/orders/kds
// @access  Private (Chef/Admin)
const getKDSOrders = asyncHandler(async (req, res) => {
  // Only show orders that are either pending, preparing, or ready
  const orders = await Order.find({
    orderStatus: { $in: ["pending", "preparing", "ready"] },
  })
    .populate({
      path: "items.dish",
      select: "name price description category preparationTime", // Include prep time for timer logic
    })
    .populate("waiter", "name")
    .sort({ "timestamps.pending": 1 }); // Sort by oldest pending first

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
  const { status } = req.body;

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

  if (
    order.isBilled ||
    order.orderStatus === "completed" ||
    order.orderStatus === "cancelled"
  ) {
    res.status(400);
    throw new Error(
      `Cannot change item status for an order that is ${order.orderStatus} or already billed.`
    );
  }

  item.status = status;

  let allItemsProcessed = true;
  let anyItemsAccepted = false;
  let allItemsReady = true;

  for (const orderItem of order.items) {
    if (orderItem.status === "pending") {
      allItemsProcessed = false;
    }
    if (
      orderItem.status === "accepted" ||
      orderItem.status === "preparing" ||
      orderItem.status === "ready"
    ) {
      anyItemsAccepted = true;
      if (orderItem.status !== "ready") {
        allItemsReady = false;
      }
    }
  }

  // --- NEW LOGIC: Update orderStatus and timestamps based on item status changes ---
  const oldOrderStatus = order.orderStatus;
  if (allItemsProcessed && anyItemsAccepted) {
    order.orderStatus = "preparing";
  }
  if (allItemsReady && anyItemsAccepted) {
    order.orderStatus = "ready";
  }

  // The pre-save hook will handle the timestamp updates, so no need to do it here.

  const updatedOrder = await order.save();

  const populatedOrder = await Order.findById(updatedOrder._id)
    .populate("waiter", "name email")
    .populate("items.dish", "name price");

  res.json(populatedOrder);
});

// @desc    Update overall order status (for chef/admin)
// @route   PUT /api/orders/:id/status
// @access  Private (Chef/Admin)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

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

  const validTransitions = {
    pending: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["completed", "cancelled"],
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

  // --- NEW: Capture old status for pre-save hook trigger ---
  const oldOrderStatus = order.orderStatus;
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

  if (order.isBilled || order.orderStatus === "completed") {
    res.status(400);
    throw new Error(
      "Cannot cancel an order that is already billed or completed."
    );
  }

  if (
    req.user.role === "waiter" &&
    order.waiter.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error("Not authorized to cancel this order.");
  }

  // --- NEW: Capture old status for pre-save hook trigger ---
  const oldOrderStatus = order.orderStatus;
  order.orderStatus = "cancelled";
  order.items.forEach((item) => {
    if (item.status !== "declined") {
      item.status = "cancelled";
    }
  });

  const updatedOrder = await order.save();

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

  if (
    req.user.role === "waiter" &&
    order.waiter.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error(
      "Not authorized to request cancellation for items in this order."
    );
  }

  item.status = "cancellation_requested";

  const updatedOrder = await order.save();

  const populatedOrder = await Order.findById(updatedOrder._id)
    .populate("waiter", "name email")
    .populate("items.dish", "name price");

  res.json(populatedOrder);
});

// @desc    Admin approves or rejects an item cancellation request
// @route   PUT /api/orders/:orderId/item/:itemId/manage-cancellation
// @access  Private (Admin)
const manageItemCancellation = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { action } = req.body; // 'approve' or 'reject'

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

  if (item.status !== "cancellation_requested") {
    res.status(400);
    throw new Error(
      `Item is not in 'cancellation_requested' status. Current status: ${item.status}.`
    );
  }

  const customerPhoneNumber = order.customerPhoneNumber;
  const dishName = (await Dish.findById(item.dish))?.name || "an item";

  if (action === "approve") {
    item.status = "cancelled";
    const adminUser = await User.findById(req.user._id).select("name");
    const adminName = adminUser ? adminUser.name : "Admin";
    const messageBody =
      `Hello ${order.customerName}!\n\n` +
      `Your request to cancel "${dishName}" (Quantity: ${item.quantity}) from your order for Table ${order.tableNumber} ` +
      `has been *APPROVED* by ${adminName}.\n\n` +
      `Your order total will be adjusted accordingly.`;
    await sendWhatsAppMessage(customerPhoneNumber, messageBody);
  } else if (action === "reject") {
    item.status = "accepted";
    const adminUser = await User.findById(req.user._id).select("name");
    const adminName = adminUser ? adminUser.name : "Admin";
    const messageBody =
      `Hello ${order.customerName}!\n\n` +
      `Your request to cancel "${dishName}" (Quantity: ${item.quantity}) from your order for Table ${order.tableNumber} ` +
      `has been *REJECTED* by ${adminName}.\n\n` +
      `The item will remain part of your order. Please contact staff for further assistance.`;
    await sendWhatsAppMessage(customerPhoneNumber, messageBody);
  } else {
    res.status(400);
    throw new Error('Invalid action. Must be "approve" or "reject".');
  }

  const updatedOrder = await order.save();

  const populatedOrder = await Order.findById(updatedOrder._id)
    .populate("waiter", "name email")
    .populate("items.dish", "name price");

  res.json(populatedOrder);
});

// @desc    Admin modifies an existing order item (dish and/or quantity)
// @route   PUT /api/orders/:orderId/item/:itemId/modify
// @access  Private/Admin
const modifyOrderItem = asyncHandler(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { dish: newDishId, quantity: newQuantity } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (
    order.isBilled ||
    order.orderStatus === "completed" ||
    order.orderStatus === "cancelled"
  ) {
    res.status(400);
    throw new Error(
      `Cannot modify order items for an order that is ${order.orderStatus} or already billed.`
    );
  }

  const itemToModify = order.items.id(itemId);

  if (!itemToModify) {
    res.status(404);
    throw new Error("Order item not found in this order");
  }

  if (newQuantity !== undefined) {
    if (typeof newQuantity !== "number" || newQuantity <= 0) {
      res.status(400);
      throw new Error("New quantity must be a positive number.");
    }
    itemToModify.quantity = newQuantity;
  }

  if (newDishId !== undefined) {
    const newDish = await Dish.findById(newDishId);
    if (!newDish) {
      res.status(404);
      throw new Error(`New dish with ID ${newDishId} not found.`);
    }
    if (!newDish.isAvailable) {
      res.status(400);
      throw new Error(`New dish "${newDish.name}" is currently not available.`);
    }
    itemToModify.dish = newDish._id;
    itemToModify.status = "pending";
  }

  const updatedOrder = await order.save();

  const populatedOrder = await Order.findById(updatedOrder._id)
    .populate({
      path: "items.dish",
      select: "name price description category",
    })
    .populate("waiter", "name email");

  res.json(populatedOrder);
});

module.exports = {
  createOrder,
  getOrders,
  getKDSOrders, // --- NEW: Export the new KDS function ---
  getOrderById,
  updateOrderItemStatus,
  updateOrderStatus,
  cancelOrder,
  requestItemCancellation,
  manageItemCancellation,
};
