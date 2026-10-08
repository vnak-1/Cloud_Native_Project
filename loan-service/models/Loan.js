const mongoose = require('mongoose');

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'returned'];

const loanSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, 'userId is required'],
    },
    userEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    equipmentId: {
      type: String,
      required: [true, 'equipmentId is required'],
    },
    equipmentName: {
      type: String,
      required: [true, 'equipmentName is required'],
    },
    days: {
      type: Number,
      required: [true, 'days is required'],
      min: [1, 'days must be from 1 to 7'],
      max: [7, 'days must be from 1 to 7'],
      validate: { validator: Number.isInteger, message: 'days must be a whole number' },
    },
    status: {
      type: String,
      enum: { values: STATUSES, message: `status must be one of: ${STATUSES.join(', ')}` },
      default: 'pending',
    },
    dueDate: { type: Date },
    returnedAt: { type: Date },
  },
  { timestamps: true }
);

loanSchema.index({ userId: 1, status: 1 });

loanSchema.index({ status: 1, dueDate: 1 });

loanSchema.index(
  { userId: 1, equipmentId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'approved'] } } }
);

module.exports = mongoose.model('Loan', loanSchema, 'loans');
