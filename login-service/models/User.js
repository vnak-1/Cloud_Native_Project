const mongoose = require('mongoose');

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
      unique: true,
    },
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
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('User', userSchema, 'users');
