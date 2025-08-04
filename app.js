// app.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors'); 
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const path = require('path');
const rateLimit = require('express-rate-limit'); // <--- NEW: Import the rate-limit library

// Route Imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const dishRoutes = require('./routes/dishRoutes');
const orderRoutes = require('./routes/orderRoutes');
const billRoutes = require('./routes/billRoutes');
const reservationRoutes = require('./routes/reservationRoutes');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors()); // Enable CORS for all origins (or configure specific ones for production)
app.use(express.json()); // Body parser for JSON requests

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure and apply the rate-limiting middleware for login attempts
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // Max 5 login attempts per 5 minutes per IP
    message: 'Too many login attempts from this IP, please try again after 5 minutes.',
    standardHeaders: true, // Return rate limit info in the headers
    legacyHeaders: false, // Disable the X-RateLimit- header
});

// Use routes
app.get('/', (req, res) => {
  res.send('Restaurant Management System API is running!');
});

// Mount the loginLimiter middleware specifically on the auth route
app.use('/api/auth', loginLimiter, authRoutes); // <--- Apply the limiter here

app.use('/api/admin/users', userRoutes); // User management is admin-specific
app.use('/api/dishes', dishRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bills', billRoutes); // Billing and Reports
app.use('/api/reservations', reservationRoutes);


// Error Handling Middleware (must be after all routes)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
