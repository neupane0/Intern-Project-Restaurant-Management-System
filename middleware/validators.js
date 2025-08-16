// middleware/validators.js
const { body, param, validationResult } = require('express-validator');

const allowedRoles = ['admin', 'chef', 'waiter'];

/** shared: check validation results */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ success: false, message: 'Validation failed', errors: errors.array() });
  }
  next();
};

/** auth: public self-register (admin-only per controller rule) */
const validateRegister = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').trim().notEmpty().withMessage('Role is required')
    .isIn(allowedRoles).withMessage(`Role must be one of: ${allowedRoles.join(', ')}`),
  body('address').optional().isLength({ min: 3 }).withMessage('Address must be at least 3 characters'),
  validate,
];

/** auth: login */
const validateLogin = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

/** auth: change password (protected) */
const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate,
];

/** admin: create user */
const validateAdminCreateUser = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').trim().notEmpty().withMessage('Role is required')
    .isIn(allowedRoles).withMessage(`Role must be one of: ${allowedRoles.join(', ')}`),
  body('address').optional().isLength({ min: 3 }).withMessage('Address must be at least 3 characters'),
  validate,
];

/** admin: update user */
const validateAdminUpdateUser = [
  param('id').isMongoId().withMessage('Invalid user id'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('role').optional().isIn(allowedRoles).withMessage(`Role must be one of: ${allowedRoles.join(', ')}`),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('address').optional().isLength({ min: 3 }).withMessage('Address must be at least 3 characters'),
  validate,
];

/** admin: id param checks for get/delete */
const validateUserIdParam = [
  param('id').isMongoId().withMessage('Invalid user id'),
  validate,
];

module.exports = {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateAdminCreateUser,
  validateAdminUpdateUser,
  validateUserIdParam,
};
