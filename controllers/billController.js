// controllers/billController.js
const asyncHandler = require("express-async-handler");
const Bill = require("../models/Bill");
const Order = require("../models/Order");
const Dish = require("../models/Dish");
const { sendWhatsAppMessage } = require("../utils/whatsappService"); // *** NEW: Import WhatsApp service ***
const User = require("../models/User"); // Required for populating billedBy name
const Report = require("../models/Report"); // *** NEW: Import the Report model ***

// @desc    Generate a bill for a completed order
// @route   POST /api/bills/:orderId
// @access  Private/Admin
const generateBill = asyncHandler(async (req, res) => {
  // --- UPDATED: Populate customerPhoneNumber from Order ---
  const order = await Order.findById(req.params.orderId)
    .populate("items.dish")
    .populate("waiter", "name"); // Also populate waiter name for bill info if needed

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
    customerPhoneNumber: order.customerPhoneNumber, // --- NEW: Copy phone number from order to bill ---
  });

  const createdBill = await bill.save();

  // Mark the order as billed
  order.isBilled = true;
  if (order.orderStatus !== "completed") {
    order.orderStatus = "completed";
  }
  await order.save();

  // const billMessage = `Hello ${order.customerName || 'customer'}!\nYour bill for Table ${order.tableNumber} has been generated.\nTotal: Rs. ${createdBill.totalAmount.toFixed(2)}\nBill ID: ${createdBill._id}\nPayment Status: Pending`;
  // await sendWhatsAppMessage(createdBill.customerPhoneNumber, billMessage);

  res.status(201).json(createdBill);
});

// @desc    Get all bills (Admin)
// @route   GET /api/bills
// @access  Private/Admin
const getBills = asyncHandler(async (req, res) => {
  const bills = await Bill.find({})
    .populate("order", "tableNumber orderStatus")
    .populate("billedBy", "name");
  res.json(bills);
});

// @desc    Get single bill by ID
// @route   GET /api/bills/:id
// @access  Private/Admin
const getBillById = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id)
    .populate("order", "tableNumber orderStatus")
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
  const { paymentStatus } = req.body; // 'paid', 'refunded'
  const bill = await Bill.findById(req.params.id).populate(
    "order",
    "tableNumber customerName"
  ); // Populate order for customer details
  if (bill) {
    if (!["paid", "refunded"].includes(paymentStatus)) {
      res.status(400);
      throw new Error('Invalid payment status. Must be "paid" or "refunded".');
    }

    const oldPaymentStatus = bill.paymentStatus;
    bill.paymentStatus = paymentStatus;
    // Populate dish names for the WhatsApp message before saving
    await bill.populate("items.dish"); // Populate actual dish documents for the message body
    const updatedBill = await bill.save();

    // --- NEW: WhatsApp Notification Logic ---
    // Trigger message only when status changes TO 'paid' from something else
    if (paymentStatus === "paid" && oldPaymentStatus !== "paid") {
      // Re-populate billedBy to get their name for the message
      const adminUser = await User.findById(updatedBill.billedBy).select(
        "name"
      );
      const billedByName = adminUser ? adminUser.name : "Admin";

      // Construct WhatsApp message
      let messageBody = `Hello ${bill.order.customerName || "customer"}!\n`;
      messageBody += `Your order for Table ${bill.order.tableNumber} (Order ID: ${bill.order._id}) has been PAID.\n\n`;
      messageBody += `--- Your Bill Summary ---\n`;
      updatedBill.items.forEach((item) => {
        // Now item.dish should be populated directly here due to the await bill.populate('items.dish')
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

      // Call the WhatsApp service to send the message
      await sendWhatsAppMessage(updatedBill.customerPhoneNumber, messageBody);
    }

    res.json(updatedBill);
  } else {
    res.status(404);
    throw new Error("Bill not found");
  }
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
  getDailySalesReport,
  getMonthlySalesReport,
  getMostOrderedDishes,
  getStoredReports,
  getStoredReportById,
  deleteStoredReport,
};
// how do i get all the daily reports here and how do I search a specific report
// and also how can i delete a report using the same code I provided to get report by
