// // controllers/userController.js
// const asyncHandler = require('express-async-handler');
// const User = require('../models/User');

// // @desc    Register a new user (Admin creates users)
// // @route   POST /api/admin/users
// // @access  Private/Admin
// const registerUser = asyncHandler(async (req, res) => {
//     const { name, email, password, role } = req.body;

//     const userExists = await User.findOne({ email });
//     if (userExists) {
//         res.status(400);
//         throw new Error('User already exists');
//     }

//     const user = await User.create({ name, email, password, role });
//     if (user) {
//         res.status(201).json({
//             _id: user._id,
//             name: user.name,
//             email: user.email,
//             role: user.role,
//         });
//     } else {
//         res.status(400);
//         throw new Error('Invalid user data');
//     }
// });

// // @desc    Get all users
// // @route   GET /api/admin/users
// // @access  Private/Admin
// const getUsers = asyncHandler(async (req, res) => {
//     const users = await User.find({});
//     res.json(users);
// });

// // @desc    Get user by ID
// // @route   GET /api/admin/users/:id
// // @access  Private/Admin
// const getUserById = asyncHandler(async (req, res) => {
//     const user = await User.findById(req.params.id).select('-password');
//     if (user) {
//         res.json(user);
//     } else {
//         res.status(404);
//         throw new Error('User not found');
//     }
// });

// // @desc    Update user
// // @route   PUT /api/admin/users/:id
// // @access  Private/Admin
// const updateUser = asyncHandler(async (req, res) => {
//     const user = await User.findById(req.params.id);
//     if (user) {
//         user.name = req.body.name || user.name;
//         user.email = req.body.email || user.email;
//         user.role = req.body.role || user.role; // Admin can change role

//         if (req.body.password) { // Allow admin to reset password
//             user.password = req.body.password;
//         }

//         const updatedUser = await user.save();
//         res.json({
//             _id: updatedUser._id,
//             name: updatedUser.name,
//             email: updatedUser.email,
//             role: updatedUser.role,
//         });
//     } else {
//         res.status(404);
//         throw new Error('User not found');
//     }
// });

// // @desc    Delete user
// // @route   DELETE /api/admin/users/:id
// // @access  Private/Admin
// const deleteUser = asyncHandler(async (req, res) => {
//     const user = await User.findById(req.params.id);
//     if (user) {
//         await user.deleteOne(); // Use deleteOne for Mongoose 6+
//         res.json({ message: 'User removed' });
//     } else {
//         res.status(404);
//         throw new Error('User not found');
//     }
// });

// module.exports = { registerUser, getUsers, getUserById, updateUser, deleteUser };



// controllers/userController.js
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// @desc    Admin creates a user (any role)
// @route   POST /api/admin/users
// @access  Private/Admin
const registerUser = asyncHandler(async (req, res) => {
  try {
    const { name, email, password, role, address } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const user = await User.create({ name, email, password, role, address });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          address: user.address || null,
        },
      },
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating user',
      error: error.message,
    });
  }
});

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: { count: users.length, users },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
      error: error.message,
    });
  }
});

// @desc    Get single user
// @route   GET /api/admin/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.status(200).json({ success: true, message: 'User fetched', data: { user } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user',
      error: error.message,
    });
  }
});

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  try {
    const { name, email, role, password, address } = req.body;

    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (address !== undefined) user.address = address;
    if (password) user.password = password; // pre-save hook will hash

    const updated = await user.save();

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          _id: updated._id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          address: updated.address || null,
        },
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user',
      error: error.message,
    });
  }
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await user.deleteOne();
    res.status(200).json({ success: true, message: 'User removed' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user',
      error: error.message,
    });
  }
});

module.exports = { registerUser, getUsers, getUserById, updateUser, deleteUser };
