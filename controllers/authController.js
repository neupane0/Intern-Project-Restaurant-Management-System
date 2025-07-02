// controllers/authController.js
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail'); // This line correctly imports from utils/sendEmail.js
const crypto = require('crypto');


// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public (Can be protected by Admin role after initial setup)
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const user = await User.create({
    name,
    email,
    password,
    role, // Assuming role is provided, otherwise schema default applies
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});


// @desc    Auth user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
const authUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password'); // Explicitly select password for comparison

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(401);
        throw new Error('Invalid email or password');
    }
});

// @desc    Forgot Password - Request reset link via email
// @route   POST /api/auth/forgotpassword
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    console.warn(`Forgot password attempt for non-existent email: ${email}`);
    // Always send 200 OK to prevent email enumeration attacks
    return res.status(200).json({ message: 'If a user with that email exists, a password reset email has been sent.' });
  }

  // OPTIONAL: Keep this check if feature is ONLY for admin, otherwise remove it
  if (user.role !== 'admin') {
      console.warn(`Forgot password attempt for non-admin user: ${email}. No reset email sent.`);
      return res.status(200).json({ message: 'If a user with that email exists, a password reset email has been sent.' });
  }

  const resetToken = user.getResetPasswordToken(); // Method on User model
  await user.save({ validateBeforeSave: false });

  const resetURL = `${req.protocol}://${req.get('host')}/resetpassword?token=${resetToken}`;

  const message = `
    <h1>You have requested a password reset</h1>
    <p>Please go to this link to reset your password:</p>
    <a href="${resetURL}" clicktracking="off">${resetURL}</a>
    <br>
    <p>This link is valid for 10 minutes only.</p>
    <p>If you did not request this, please ignore this email.</p>
  `;

  try {
    await sendEmail({ // This is the call to the function imported from utils/sendEmail.js
      email: user.email,
      subject: 'Password Reset Request for Restaurant Admin System',
      message,
    });

    res.status(200).json({ success: true, message: 'Password reset email sent successfully.' });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });

    console.error('Error sending reset email:', error);
    res.status(500);
    throw new Error('Email could not be sent. Please try again later.');
  }
});

// @desc    Reset Password - Set new password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired reset token');
  }

  if (req.body.password !== req.body.confirmPassword) {
    res.status(400);
    throw new Error('Passwords do not match');
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  res.json({
    success: true,
    message: 'Password reset successful',
    token: generateToken(user._id),
  });
});


module.exports = { authUser, registerUser, forgotPassword, resetPassword };
