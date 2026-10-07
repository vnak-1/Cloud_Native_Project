const mongoose = require('mongoose');

// The schema says what one user looks like and which values are allowed. Mongoose checks
// these rules before saving; a broken rule becomes a ValidationError (400).
// registration-service and login-service each keep their own copy of this file.
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'email must look like an email'],
      // Creates a unique index in MongoDB. A duplicate email fails with error code 11000,
      // which the error handler turns into 409.
      unique: true,
    },
    // Only ever a bcrypt hash, never the real password. "select: false" leaves it out of
    // query results unless a query asks for it (only login does).
    password: {
      type: String,
      required: [true, 'password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: { values: ['admin', 'user'], message: 'role must be admin or user' },
      default: 'user',
    },
    phone: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
    // When a user is turned into JSON for a response, drop the password hash
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
  }
);

// The 3rd argument is the exact collection name ("users")
module.exports = mongoose.model('User', userSchema, 'users');
