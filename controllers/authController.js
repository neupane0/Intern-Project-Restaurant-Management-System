// // controllers/authController.js
// const asyncHandler = require('express-async-handler');
// const User = require('../models/User');
// const generateToken = require('../utils/generateToken');
// const sendEmail = require('../utils/sendEmail');
// const crypto = require('crypto');

// // @desc    Register a new user
// // @route   POST /api/auth/register
// // @access  Public (Can be protected by Admin role after initial setup)


// // Controller to register a new user
// // It checks if the email already exists, hashes the password, and saves the new user to the DB
// const registerUser = asyncHandler(async (req, res) => {
//   const { name, email, password, role } = req.body;

//   // Only allow admin self-registration through this route
//   if (role !== 'admin') {
//     res.status(403);
//     throw new Error('Only admin self-registration is allowed from this endpoint');
//   }

//   const userExists = await User.findOne({ email });

//   if (userExists) {
//     res.status(400);
//     throw new Error('User already exists');
//   }

//   // Create a new user with the provided details
//   // The password will be hashed by the User model's pre-save hook
//   const user = await User.create({
//     name,
//     email,
//     password,
//     role,
//   });

//   // If user creation is successful, respond with user details and a JWT token
//   // The token is generated using the user's ID
//   if (user) {
//     res.status(201).json({
//       success: true,
//       message: 'User registered successfully',
//       user: {
//         _id: user._id,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//       },
//       token: generateToken(user._id),
//     });
//   } else {
//     res.status(400);
//     throw new Error('Invalid user data');
//   }
// });

// // @desc    Auth user & get token (Login)
// // @route   POST /api/auth/login
// // @access  Public
// const authUser = asyncHandler(async (req, res) => {
//   const { email, password } = req.body;
//   const user = await User.findOne({ email }).select('+password');

//   if (user && (await user.matchPassword(password))) {
//     res.status(200).json({
//       success: true,
//       message: 'Login successful',
//       user: {
//         _id: user._id,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//       },
//       token: generateToken(user._id),
//     });
//   } else {
//     res.status(401);
//     throw new Error('Invalid email or password');
//   }
// });

// // @desc    Forgot Password - Request reset link via email
// // @route   POST /api/auth/forgotpassword
// // @access  Public
// const forgotPassword = asyncHandler(async (req, res) => {
//   const { email } = req.body;

//   const user = await User.findOne({ email });

//   if (!user) {
//     console.warn(`Forgot password attempt for non-existent email: ${email}`);
//     // Send 200 to avoid email enumeration attacks
//     return res.status(200).json({ message: 'If a user with that email exists, a password reset email has been sent.' });
//   }

//   if (user.role !== 'admin') {
//     console.warn(`Forgot password attempt for non-admin user: ${email}. No reset email sent.`);
//     return res.status(200).json({ message: 'If a user with that email exists, a password reset email has been sent.' });
//   }

//   const resetToken = user.getResetPasswordToken();
//   await user.save({ validateBeforeSave: false });

//   const resetURL = `${req.protocol}://${req.get('host')}/resetpassword?token=${resetToken}`;

//   const message = `
//     <h1>You have requested a password reset</h1>
//     <p>Please go to this link to reset your password:</p>
//     <a href="${resetURL}" clicktracking="off">${resetURL}</a>
//     <br>
//     <p>This link is valid for 10 minutes only.</p>
//     <p>If you did not request this, please ignore this email.</p>
//   `;

//   try {
//     await sendEmail({
//       email: user.email,
//       subject: 'Password Reset Request for Restaurant Admin System',
//       message,
//     });

//     res.status(200).json({ success: true, message: 'Password reset email sent successfully.' });
//   } catch (error) {
//     user.resetPasswordToken = undefined;
//     user.resetPasswordExpire = undefined;
//     await user.save({ validateBeforeSave: false });

//     console.error('Error sending reset email:', error);
//     res.status(500);
//     throw new Error('Email could not be sent. Please try again later.');
//   }
// });

// // @desc    Reset Password - Set new password
// // @route   PUT /api/auth/resetpassword/:resettoken
// // @access  Public
// const resetPassword = asyncHandler(async (req, res) => {
//   const resetPasswordToken = crypto
//     .createHash('sha256')
//     .update(req.params.resettoken)
//     .digest('hex');

//   const user = await User.findOne({
//     resetPasswordToken,
//     resetPasswordExpire: { $gt: Date.now() },
//   });

//   if (!user) {
//     res.status(400);
//     throw new Error('Invalid or expired reset token');
//   }

//   if (req.body.password !== req.body.confirmPassword) {
//     res.status(400);
//     throw new Error('Passwords do not match');
//   }

//   user.password = req.body.password;
//   user.resetPasswordToken = undefined;
//   user.resetPasswordExpire = undefined;

//   await user.save();

//   res.status(200).json({
//     success: true,
//     message: 'Password reset successful',
//     token: generateToken(user._id),
//   });
// });

// module.exports = { authUser, registerUser, forgotPassword, resetPassword };



// controllers/authController.js
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');

// @desc    Register a new user (Admin self-register only on this public route)
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  try {
    const { name, email, password, role, address } = req.body;

    // enforce "admin-only" self-registration policy on this endpoint
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin self-registration is allowed from this endpoint',
      });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const user = await User.create({ name, email, password, role, address });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          address: user.address || null,
        },
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while registering user',
      error: error.message,
      nextStep: 'Please try again or contact support if the issue persists.',
    });
  }
});

// @desc    Login user (admin/chef/waiter)
// @route   POST /api/auth/login
// @access  Public
const authUser = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          address: user.address || null,
        },
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while logging in',
      error: error.message,
      nextStep: 'Please try again or reset your password if you forgot it.',
    });
  }
});

// @desc    Change password (logged-in users)
// @route   PUT /api/auth/changepassword
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      nextStep: 'Use your new password the next time you log in.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while changing password',
      error: error.message,
    });
  }
});

// @desc    Forgot Password - request reset link via email
// @route   POST /api/auth/forgotpassword
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // do not reveal existence
      return res.status(200).json({
        success: true,
        message:
          'If a user with that email exists, a password reset email has been sent.',
      });
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const resetURL = `${req.protocol}://${req.get('host')}/resetpassword?token=${resetToken}`;
    const message = `
      <h1>Password Reset Requested</h1>
      <p>Click the link below to reset your password (valid for 10 minutes):</p>
      <a href="${resetURL}" clicktracking="off">${resetURL}</a>
      <p>If you did not request this, you can ignore this email.</p>
    `;

    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request',
      message,
    });

    res.status(200).json({
      success: true,
      message: 'Password reset email sent (if the account exists).',
    });
  } catch (error) {
    // if token was set, clean up on failure to send
    try {
      if (typeof user !== 'undefined') {
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
      }
    } catch (_) {}
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Email could not be sent. Please try again later.',
      error: error.message,
    });
  }
});

// @desc    Reset Password - finalize new password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  try {
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
    }

    const { password, confirmPassword } = req.body;
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password and confirmPassword are required',
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      data: { token: generateToken(user._id) },
      nextStep: 'You are now logged in. Store this token securely.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting password',
      error: error.message,
    });
  }
});

module.exports = {
  registerUser,
  authUser,
  changePassword,
  forgotPassword,
  resetPassword,
};
