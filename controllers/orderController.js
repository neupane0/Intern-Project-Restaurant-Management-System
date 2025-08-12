// controllers/orderController.js
const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Dish = require("../models/Dish"); // To get dish price

// @desc    Create a new order (with reordering capability)
// @route   POST /api/orders
// @access  Private (Waiter/Admin)
const createOrder = asyncHandler(async (req, res) => {
  // NEW: Add reorderFromOrderId to destructuring
  const {
    tableNumber,
    customerName,
    customerPhoneNumber,
    items,
    reorderFromOrderId,
  } = req.body;

  let orderItems = [];
  let finalCustomerName = customerName;
  let finalCustomerPhoneNumber = customerPhoneNumber;

  if (reorderFromOrderId) {
    // --- Reordering from a past order ---
    const pastOrder = await Order.findById(reorderFromOrderId);

    if (!pastOrder) {
      res.status(404);
      throw new Error("Past order for reordering not found.");
    }

    // Use customer details from past order if not explicitly provided in new request
    finalCustomerName = customerName || pastOrder.customerName;
    finalCustomerPhoneNumber =
      customerPhoneNumber || pastOrder.customerPhoneNumber;

    // Filter out cancelled/declined items from the past order for reordering
    for (const item of pastOrder.items) {
      if (item.status !== "cancelled" && item.status !== "declined") {
        const dish = await Dish.findById(item.dish);
        if (!dish || !dish.isAvailable) {
          // Check if dish still exists and is available
          console.warn(`Skipping unavailable dish ${item.dish} from reorder.`);
          continue; // Skip this item if it's no longer available
        }
        orderItems.push({
          dish: item.dish,
          quantity: item.quantity,
          status: "pending",
          notes: item.notes || "",
        });
      }
    }
    if (orderItems.length === 0) {
      res.status(400);
      throw new Error("No valid items found in the past order for reordering.");
    }
  } else {
    // --- Creating a brand new order ---
    if (
      !tableNumber ||
      !finalCustomerName ||
      !finalCustomerPhoneNumber ||
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
            status: 'pending', // Default status for new items
            notes: item.notes || '', // Capture notes for the item
        });
    }
  }
  // 3. Create the order document
  const order = new Order({
    tableNumber,
    customerName, // --- NEW: Save customerName ---
    customerPhoneNumber, // --- NEW: Save customerPhoneNumber ---
    waiter: req.user._id, // The logged-in waiter
    items: orderItems,
    totalAmount: initialTotal, // This will be recalculated by pre-save hook
    orderStatus: "pending",
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

// @desc    Get all orders (with optional filters for history)
// @route   GET /api/orders
// @access  Private (Admin/Chef/Waiter)
const getOrders = asyncHandler(async (req, res) => {
  const { role } = req.user;
  // NEW: Add customerName and customerPhoneNumber to query destructuring
  const {
    status,
    customerName,
    customerPhoneNumber,
    tableNumber,
    startDate,
    endDate,
  } = req.query;
  let query = {};

  // Base filtering by role
  if (role === "chef") {
    query.orderStatus = {
      $in: ["pending", "preparing", "ready", "cancellation_requested"],
    };
    // Chefs should see items that are active or requested cancellation
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
  // Admin sees all orders (no specific query needed for role)

  // NEW: Add filters for order history
  if (status) {
    query.orderStatus = status;
  }
  if (tableNumber) {
    query.tableNumber = tableNumber;
  }
  if (customerName) {
    // Case-insensitive partial match for customer name
    query.customerName = { $regex: customerName, $options: "i" };
  }
  if (customerPhoneNumber) {
    // Exact match for phone number (assuming E.164 format for consistency)
    query.customerPhoneNumber = customerPhoneNumber;
  }
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);
      query.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

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

  let allItemsProcessed = true;
  let anyItemsAccepted = false;
  let allItemsReady = true;

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
    order.orderStatus = "preparing";
  }
  if (allItemsReady && anyItemsAccepted) {
    order.orderStatus = "ready";
  }

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

        // Send WhatsApp notification for approved cancellation
        const messageBody = `Hello ${order.customerName}!\n\n` +
                            `Your request to cancel "${dishName}" (Quantity: ${item.quantity}) from your order for Table ${order.tableNumber} ` +
                            `has been *APPROVED* by ${adminName}.\n\n` +
                            `Your order total will be adjusted accordingly.`;
        await sendWhatsAppMessage(customerPhoneNumber, messageBody);

    } else if (action === 'reject') {
        // Revert to 'accepted' or 'preparing' based on original status before request.
        // For simplicity, let's revert to 'accepted' if it was accepted, otherwise to 'pending'.
        // A more robust system might store the 'previousStatus' when 'cancellation_requested' is set.
        item.status = 'accepted'; // Assume it was accepted before request
        const adminUser = await User.findById(req.user._id).select('name');
        const adminName = adminUser ? adminUser.name : 'Admin';

        // Send WhatsApp notification for rejected cancellation
        const messageBody = `Hello ${order.customerName}!\n\n` +
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


module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderItemStatus,
  updateOrderStatus,
  cancelOrder,
};
