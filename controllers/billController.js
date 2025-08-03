// controllers/billController.js
const asyncHandler = require("express-async-handler");
const Bill = require("../models/Bill");
const Order = require("../models/Order");
const Dish = require("../models/Dish");
const { sendWhatsAppMessage } = require("../utils/whatsappService");
const User = require("../models/User");
const { v4: uuidv4 } = require("uuid"); // *** NEW: Import uuid for unique identifiers ***

// @desc    Generate a bill for a completed order
// @route   POST /api/bills/:orderId
// @access  Private/Admin
const generateBill = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId)
    .populate("items.dish")
    .populate("waiter", "name");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.isBilled) {
    res.status(400);
    throw new Error("This order has already been billed");
  }

  // Only accepted items are billed
  const billedItems = [];
  let totalAmount = 0;

  for (const item of order.items) {
    if (!item.dish) {
      res.status(500); // Internal server error if dish not populated
      throw new Error(
        `Dish not populated for item ${item._id} in order ${order._id}.`
      );
    }
    if (item.status === "accepted") {
      billedItems.push({
        dish: item.dish._id,
        quantity: item.quantity,
        price: item.dish.price, // Use the current price from the dish model
      });
      totalAmount += item.quantity * item.dish.price;
    }
  }

  if (billedItems.length === 0) {
    res.status(400);
    throw new Error(
      "No accepted dishes in this order to bill. Please accept items first."
    );
  }

  const bill = new Bill({
    order: order._id,
    billedBy: req.user._id, // The logged-in admin
    items: billedItems,
    totalAmount: totalAmount,
    paymentStatus: "pending",
    customerPhoneNumber: order.customerPhoneNumber,
    originalOrderTotal: order.totalAmount, // Store original total for reference
    customerName: order.customerName, // Copy customer name from order
  });

  const createdBill = await bill.save();

  // Mark the order as billed
  order.isBilled = true;
  if (order.orderStatus !== "completed") {
    order.orderStatus = "completed";
  }
  await order.save();

  res.status(201).json(createdBill);
});

// @desc    Get all bills (Admin)
// @route   GET /api/bills
// @access  Private/Admin
const getBills = asyncHandler(async (req, res) => {
  const bills = await Bill.find({})
    .populate(
      "order",
      "tableNumber orderStatus customerName customerPhoneNumber"
    ) // Populate more order fields
    .populate("billedBy", "name");
  res.json(bills);
});

// @desc    Get single bill by ID
// @route   GET /api/bills/:id
// @access  Private/Admin
const getBillById = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id)
    .populate(
      "order",
      "tableNumber orderStatus customerName customerPhoneNumber"
    )
    .populate("billedBy", "name");
  if (bill) {
    res.json(bill);
  } else {
    res.status(404);
    throw new Error("Bill not found");
  }
});

// @desc    Update payment status of a bill and send WhatsApp notification
// @route   PUT /api/bills/:id/pay
// @access  Private/Admin
const updateBillPaymentStatus = asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  const bill = await Bill.findById(req.params.id).populate(
    "order",
    "tableNumber customerName"
  );
  if (bill) {
    if (!["paid", "refunded"].includes(paymentStatus)) {
      res.status(400);
      throw new Error('Invalid payment status. Must be "paid" or "refunded".');
    }

    const oldPaymentStatus = bill.paymentStatus;
    bill.paymentStatus = paymentStatus;
    await bill.populate("items.dish"); // Populate actual dish documents for the message body
    const updatedBill = await bill.save();

    if (paymentStatus === "paid" && oldPaymentStatus !== "paid") {
      const adminUser = await User.findById(updatedBill.billedBy).select(
        "name"
      );
      const billedByName = adminUser ? adminUser.name : "Admin";

      let messageBody = `Hello ${bill.order.customerName || "customer"}!\n`;
      messageBody += `Your bill for Table ${bill.order.tableNumber} (Order ID: ${bill.order._id}) has been PAID.\n\n`;
      messageBody += `--- Your Bill Summary ---\n`;
      updatedBill.items.forEach((item) => {
        const dishName =
          item.dish && item.dish.name ? item.dish.name : "Unknown Dish";
        messageBody += `${item.quantity}x ${dishName} @ Rs.${item.price.toFixed(
          2
        )}\n`;
      });
      messageBody += `------------------------\n`;
      messageBody += `Total Amount: Rs. ${updatedBill.totalAmount.toFixed(
        2
      )}\n`;
      messageBody += `Payment Status: PAID\n`;
      messageBody += `Billed by: ${billedByName}\n`;
      messageBody += `Thank you for your business!`;

      await sendWhatsAppMessage(updatedBill.customerPhoneNumber, messageBody);
    }

    res.json(updatedBill);
  } else {
    res.status(404);
    throw new Error("Bill not found");
  }
});

// @desc    Split a bill for an order into multiple sub-bills
// @route   POST /api/bills/:orderId/split
// @access  Private/Admin
const splitBill = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { splits } = req.body; // Expected format: [{ customerName: "...", items: [{ dish: "dishId", quantity: N }] }]

  if (!splits || !Array.isArray(splits) || splits.length < 2) {
    res.status(400);
    throw new Error(
      "Splits array is required and must contain at least 2 split portions."
    );
  }

  const originalOrder = await Order.findById(orderId).populate("items.dish");

  if (!originalOrder) {
    res.status(404);
    throw new Error("Original order not found.");
  }

  if (originalOrder.isBilled) {
    res.status(400);
    throw new Error("This order has already been billed and cannot be split.");
  }

  // Ensure the order has accepted items to be split
  const acceptedOrderItemsMap = new Map(); // Map<dishId.toString(), { dish: DishDoc, quantity: Number }>
  originalOrder.items.forEach((item) => {
    if (item.status === "accepted" && item.dish) {
      const dishIdStr = item.dish._id.toString();
      acceptedOrderItemsMap.set(dishIdStr, {
        dish: item.dish, // Store the populated dish document
        quantity:
          (acceptedOrderItemsMap.get(dishIdStr)?.quantity || 0) + item.quantity,
      });
    }
  });

  if (acceptedOrderItemsMap.size === 0) {
    res.status(400);
    throw new Error("No accepted items in the original order to split.");
  }

  const createdBills = [];
  const splitGroupIdentifier = uuidv4(); // Generate a unique ID for this split operation

  // --- Validate and process each split portion ---
  for (const [index, split] of splits.entries()) {
    if (
      !split.items ||
      !Array.isArray(split.items) ||
      split.items.length === 0
    ) {
      res.status(400);
      throw new Error(
        `Split portion ${index + 1} must contain at least one item.`
      );
    }

    const splitBillItems = [];
    let currentSplitAmount = 0;
    const currentSplitItemsTracker = new Map(); // To track items within this specific split to prevent duplicates

    for (const splitItem of split.items) {
      if (
        !splitItem.dish ||
        !splitItem.quantity ||
        typeof splitItem.quantity !== "number" ||
        splitItem.quantity <= 0
      ) {
        res.status(400);
        throw new Error(
          `Invalid item details in split portion ${
            index + 1
          }. Each item must have a valid dish ID and positive quantity.`
        );
      }

      const dishIdStr = splitItem.dish.toString();

      // Check for duplicate items within the current split portion
      if (currentSplitItemsTracker.has(dishIdStr)) {
        res.status(400);
        throw new Error(
          `Duplicate dish ${dishIdStr} found within split portion ${
            index + 1
          }. Each item should appear once per split.`
        );
      }
      currentSplitItemsTracker.set(dishIdStr, splitItem.quantity);

      // Check if this dish is in the original accepted order items and if quantity is available
      if (!acceptedOrderItemsMap.has(dishIdStr)) {
        res.status(400);
        throw new Error(
          `Dish ID ${dishIdStr} in split portion ${
            index + 1
          } is not part of the original accepted order items.`
        );
      }

      const originalDishInfo = acceptedOrderItemsMap.get(dishIdStr);
      if (splitItem.quantity > originalDishInfo.quantity) {
        res.status(400);
        throw new Error(
          `Quantity ${splitItem.quantity} for dish "${
            originalDishInfo.dish.name
          }" in split portion ${
            index + 1
          } exceeds available quantity in original order (${
            originalDishInfo.quantity
          }).`
        );
      }

      splitBillItems.push({
        dish: originalDishInfo.dish._id,
        quantity: splitItem.quantity,
        price: originalDishInfo.dish.price, // Use price from the populated original dish
      });
      currentSplitAmount += splitItem.quantity * originalDishInfo.dish.price;

      // Decrement quantity from the master map of original accepted items
      originalDishInfo.quantity -= splitItem.quantity;
      if (originalDishInfo.quantity === 0) {
        acceptedOrderItemsMap.delete(dishIdStr); // Remove if fully allocated
      } else {
        acceptedOrderItemsMap.set(dishIdStr, originalDishInfo); // Update remaining quantity
      }
    }

    // Create the new Bill document for this split portion
    const newBill = new Bill({
      order: originalOrder._id,
      billedBy: req.user._id,
      items: splitBillItems,
      totalAmount: currentSplitAmount,
      paymentStatus: "pending",
      customerPhoneNumber: originalOrder.customerPhoneNumber, // All splits get original order's phone for now
      isSplitBill: true,
      splitGroupIdentifier: splitGroupIdentifier,
      originalOrderTotal: originalOrder.totalAmount, // Store original total for reference
      customerName: split.customerName || `Split Customer ${index + 1}`, // Optional customer name per split
    });
    const createdBill = await newBill.save();
    createdBills.push(createdBill);
  }

  // --- Final validation: Ensure all original accepted items were allocated ---
  if (acceptedOrderItemsMap.size > 0) {
    const unallocatedDishes = Array.from(acceptedOrderItemsMap.values())
      .map((item) => `${item.dish.name} (Qty: ${item.quantity})`)
      .join(", ");
    // If there are remaining items, it means not all original items were covered by the splits
    // In a real-world scenario, you might want to implement a transaction or rollback mechanism here.
    // For now, we'll throw an error and rely on the client to handle partial success/failure.
    res.status(400);
    throw new Error(
      `Not all original accepted order items were allocated in the splits. Unallocated: ${unallocatedDishes}`
    );
  }

  // --- Mark original order as billed and completed ---
  // This happens ONLY if all splits were successfully created and all items allocated.
  originalOrder.isBilled = true;
  originalOrder.orderStatus = "completed";
  await originalOrder.save();

  res.status(201).json({
    message: "Bill successfully split into multiple portions.",
    splitBills: createdBills.map((bill) => ({
      _id: bill._id,
      totalAmount: bill.totalAmount,
      customerName: bill.customerName,
      paymentStatus: bill.paymentStatus,
      splitGroupIdentifier: bill.splitGroupIdentifier,
      orderId: bill.order, // Include original order ID for reference
    })),
  });
});

// @desc    Get Daily Sales Report for a specific day or current day
// @route   GET /api/reports/sales/daily?date=YYYY-MM-DD
// @access  Private/Admin
const getDailySalesReport = asyncHandler(async (req, res) => {
  let targetDate;
  if (req.query.date) {
    targetDate = new Date(req.query.date);
    if (isNaN(targetDate.getTime())) {
      res.status(400);
      throw new Error("Invalid date format. Please use ISO 8601 YYYY-MM-DD.");
    }
  } else {
    targetDate = new Date(); // Default to today if no date is provided
  }

  targetDate.setHours(0, 0, 0, 0); // Start of the target day
  const nextDay = new Date(targetDate);
  nextDay.setDate(targetDate.getDate() + 1); // Start of the next day

  // Try to find an existing report first
  const existingReport = await Report.findOne({
    reportType: "daily_sales",
    reportDate: targetDate, // Match by exact start-of-day date
  });

  if (existingReport && req.query.generate !== "true") {
    // If report exists and 'generate=true' is not specified, return existing
    return res.json(existingReport.data);
  }

  // Otherwise, generate the report
  const dailySales = await Bill.aggregate([
    {
      $match: {
        billDate: { $gte: targetDate, $lt: nextDay },
        paymentStatus: "paid",
      },
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$totalAmount" },
        totalBills: { $sum: 1 },
      },
    },
  ]);
  const reportData = dailySales[0] || { totalSales: 0, totalBills: 0 };

  // Save the generated report to the database
  try {
    await Report.findOneAndUpdate(
      { reportType: "daily_sales", reportDate: targetDate }, // Find by report type and date
      {
        $set: {
          data: reportData,
          generatedBy: req.user._id,
          periodStart: targetDate,
          periodEnd: new Date(nextDay.getTime() - 1),
        },
      }, // Set data and metadata
      { upsert: true, new: true, setDefaultsOnInsert: true } // Create if not exists, return new doc
    );
    console.log(
      `Daily Sales Report for ${
        targetDate.toISOString().split("T")[0]
      } generated and/or updated.`
    );
  } catch (error) {
    // Log errors but don't prevent report from being returned
    console.error("Error saving daily report:", error.message);
  }

  res.json(reportData); // Always return the freshly generated or existing data
});

// @desc    Generate and/or get Monthly Sales Report for a specific month/year or current month
// @route   GET /api/reports/sales/monthly?year=YYYY&month=MM (month is 1-indexed)
// @access  Private/Admin
const getMonthlySalesReport = asyncHandler(async (req, res) => {
  let year, month;
  const now = new Date();

  if (req.query.year && req.query.month) {
    year = parseInt(req.query.year, 10);
    month = parseInt(req.query.month, 10); // Month comes as 1-indexed from query

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      res.status(400);
      throw new Error(
        "Invalid year or month format. Year must be 4 digits, month must be 1-12."
      );
    }
  } else {
    // Default to current year and month if parameters are not provided
    year = now.getFullYear();
    month = now.getMonth() + 1; // getMonth() is 0-indexed, so add 1
  }

  const startOfMonth = new Date(year, month - 1, 1); // Date constructor month is 0-indexed
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999); // Last day of the target month, end of day

  // Try to find an existing report first
  const existingReport = await Report.findOne({
    reportType: "monthly_sales",
    reportDate: startOfMonth, // Match by exact start-of-month date
  });

  if (existingReport && req.query.generate !== "true") {
    return res.json(existingReport.data);
  }

  // Otherwise, generate the report
  const monthlySales = await Bill.aggregate([
    {
      $match: {
        billDate: { $gte: startOfMonth, $lte: endOfMonth },
        paymentStatus: "paid",
      },
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$totalAmount" },
        totalBills: { $sum: 1 },
      },
    },
  ]);
  const reportData = monthlySales[0] || { totalSales: 0, totalBills: 0 };

  // Save the generated report to the database
  try {
    await Report.findOneAndUpdate(
      { reportType: "monthly_sales", reportDate: startOfMonth },
      {
        $set: {
          data: reportData,
          generatedBy: req.user._id,
          periodStart: startOfMonth,
          periodEnd: endOfMonth,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(
      `Monthly Sales Report for ${year}-${month} generated and/or updated.`
    );
  } catch (error) {
    console.error("Error saving monthly report:", error.message);
  }

  res.json(reportData);
});

// @desc    Generate and/or get Most Ordered Dishes report for a specific date range or all time
// @route   GET /api/reports/dishes/most-ordered?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&generate=true
// @access  Private/Admin
const getMostOrderedDishes = asyncHandler(async (req, res) => {
  const matchQuery = { paymentStatus: "paid" };
  let periodStart = null;
  let periodEnd = null;
  let reportKeyDate; // A unique date for the report for storage purposes

  if (req.query.startDate || req.query.endDate) {
    periodStart = req.query.startDate ? new Date(req.query.startDate) : null;
    periodEnd = req.query.endDate ? new Date(req.query.endDate) : null;

    if (periodStart && isNaN(periodStart.getTime())) {
      res.status(400);
      throw new Error(
        "Invalid startDate format. Please use ISO 8601 YYYY-MM-DD."
      );
    }
    if (periodEnd && isNaN(periodEnd.getTime())) {
      res.status(400);
      throw new Error(
        "Invalid endDate format. Please use ISO 8601 YYYY-MM-DD."
      );
    }

    if (periodStart || periodEnd) {
      matchQuery.billDate = {};
      if (periodStart) {
        periodStart.setHours(0, 0, 0, 0);
        matchQuery.billDate.$gte = periodStart;
      }
      if (periodEnd) {
        periodEnd.setHours(23, 59, 59, 999);
        matchQuery.billDate.$lte = periodEnd;
      }
    }
    // Create a unique reportKeyDate for range-based reports
    // For range reports, a composite key could be better for unique indexing,
    // but using the start date or epoch if only end is provided for simplicity here.
    reportKeyDate = periodStart || new Date(0); // If only endDate, use epoch
  } else {
    // For 'all time' report, use a fixed epoch date as reportKeyDate
    reportKeyDate = new Date(0); // Unix Epoch: Represents all time
  }

  // Try to find an existing report first
  const existingReport = await Report.findOne({
    reportType: "most_ordered_dishes",
    reportDate: reportKeyDate, // Match by the derived unique key date for aggregation
    // For accurate lookup of range-based reports, data.startDate and data.endDate could be part of index
    // 'data.startDate': periodStart,
    // 'data.endDate': periodEnd,
  });

  if (existingReport && req.query.generate !== "true") {
    return res.json(existingReport.data);
  }

  // Generate the report
  const mostOrdered = await Bill.aggregate([
    {
      $match: matchQuery,
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.dish",
        totalQuantity: { $sum: "$items.quantity" },
      },
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "dishes",
        localField: "_id",
        foreignField: "_id",
        as: "dishInfo",
      },
    },
    { $unwind: "$dishInfo" },
    {
      $project: {
        _id: 0,
        dishName: "$dishInfo.name",
        totalQuantity: 1,
      },
    },
  ]);
  const reportData = mostOrdered; // This is already an array

  // Save the generated report to the database
  try {
    // When using updateOne/findOneAndUpdate with unique index and upsert,
    // you need to provide all parts of the unique key in the find query.
    // For 'most_ordered_dishes', if it's based on ranges, the 'reportDate' alone might not be unique.
    // Consider a compound index with reportType, reportDate, and potentially hashes of periodStart/End,
    // or a simpler strategy if the range is always static (e.g., all-time).
    const findQuery = {
      reportType: "most_ordered_dishes",
      reportDate: reportKeyDate,
    };
    // Add specific range properties to the findQuery for uniqueness if needed
    if (periodStart) findQuery.periodStart = periodStart;
    if (periodEnd) findQuery.periodEnd = periodEnd;

    await Report.findOneAndUpdate(
      findQuery,
      {
        $set: {
          data: reportData,
          generatedBy: req.user._id,
          periodStart: periodStart, // Store start/end dates
          periodEnd: periodEnd, // Store start/end dates
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Most Ordered Dishes Report generated and/or updated.`);
  } catch (error) {
    // Catch specific duplicate key error (E11000) if reportKeyDate/periodStart/periodEnd needs tuning
    if (error.code === 11000) {
      console.warn(
        "Attempted to save duplicate Most Ordered Dishes report:",
        error.message
      );
    } else {
      console.error("Error saving most ordered dishes report:", error.message);
    }
  }

  res.json(reportData);
});

// @desc    Get all stored reports
// @route   GET /api/reports/stored
// @access  Private/Admin
const getStoredReports = asyncHandler(async (req, res) => {
  // Optionally filter by reportType or date range
  const { reportType, startDate, endDate } = req.query;
  let query = {};

  if (reportType) {
    query.reportType = reportType;
  }
  if (startDate || endDate) {
    query.reportDate = {};
    if (startDate) {
      query.reportDate.$gte = new Date(startDate);
    }
    if (endDate) {
      // Adjust endDate to include the whole day
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.reportDate.$lte = endOfDay;
    }
  }

  const reports = await Report.find(query)
    .populate("generatedBy", "name email") // Populate who generated it
    .sort({ reportDate: -1 }); // Latest reports first

  res.json(reports);
});

// @desc    Get a specific stored report by ID
// @route   GET /api/reports/stored/:id
// @access  Private/Admin
const getStoredReportById = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id).populate(
    "generatedBy",
    "name email"
  );

  if (report) {
    res.json(report);
  } else {
    res.status(404);
    throw new Error("Stored report not found");
  }
});

// @desc    Delete a specific stored report by ID
// @route   DELETE /api/reports/stored/:id
// @access  Private/Admin
const deleteStoredReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);

  if (report) {
    await report.deleteOne();
    res.json({ message: "Stored report removed successfully" });
  } else {
    res.status(404);
    throw new Error("Stored report not found");
  }
});

module.exports = {
  generateBill,
  getBills,
  getBillById,
  updateBillPaymentStatus,
  splitBill,
  getDailySalesReport,
  getMonthlySalesReport,
  getMostOrderedDishes,
  getStoredReports,
  getStoredReportById,
  deleteStoredReport,
};
