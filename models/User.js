// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // For hashing passwords
const crypto = require('crypto'); // Node.js built-in module for cryptographic functions

// Define the User Schema
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true, // Trim whitespace from both ends
    },
    email: {
      type: String,
      required: true,
      unique: true, // Ensures no two users can have the same email
      trim: true, // Trim whitespace from both ends
      // CORRECTED REGEX: Changed 'a-ZAZ' to 'a-zA-Z' for proper alphabet range
      match: [/^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[a-zA-Z]{2,7}$/, 'Please add a valid email'],
    },
    password: {
      type: String,
      required: true,
      minlength: 6, // Minimum password length for security
      select: false, // Don't return password by default in queries
    },
    role: {
      type: String,
      enum: ["admin", "chef", "waiter", "customer"], // Restricts roles to these specific values
      default: "customer", // Default role for new registrations if not specified
    },
    // Fields for password reset
    resetPasswordToken: String, // Stores the hashed reset token
    resetPasswordExpire: Date,  // Stores the expiration time of the token
  },
  {
    timestamps: true, // Automatically adds `createdAt` and `updatedAt` fields
  }
);

// --- Mongoose Middleware (Hooks) ---

// Pre-save hook: Hash password before saving a new user or if password is modified
userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) {
    next(); // Skip hashing if password wasn't changed
  }

  // Generate a salt (random value used to hash the password)
  const salt = await bcrypt.genSalt(10); // 10 rounds of hashing for security
  // Hash the password using the generated salt
  this.password = await bcrypt.hash(this.password, salt);
  next(); // Proceed with the save operation
});

// --- Instance Methods ---

// Method to compare an entered password with the hashed password in the database
userSchema.methods.matchPassword = async function (enteredPassword) {
  // Compare the plain text 'enteredPassword' with the hashed 'this.password' (from the document)
  return await bcrypt.compare(enteredPassword, this.password);
};

// Instance Method: Generate and set password reset token
userSchema.methods.getResetPasswordToken = function () {
    // Generate a random token (unhashed)
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash the resetToken and set to resetPasswordToken field
    // We hash it to store it securely in the database. The plain text token is sent to the user.
    this.resetPasswordToken = crypto
        .createHash('sha256') // Using SHA256 for hashing
        .update(resetToken)
        .digest('hex');

    // Set token expire time (e.g., 10 minutes from now)
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes in milliseconds

    return resetToken; // Return the UNHASHED token to send to the user's email
};

// Create the User Model from the schema
const User = mongoose.model("User", userSchema);

module.exports = User;
