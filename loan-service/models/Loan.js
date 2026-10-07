const mongoose = require('mongoose');

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'returned'];

// The schema says what one loan looks like and which values are allowed. Mongoose checks
// these rules before saving; a broken rule becomes a ValidationError (400).
const loanSchema = new mongoose.Schema(
  {
    // Always taken from the x-user-id header the gateway sets, never from the request body
    userId: {
      type: String,
      required: [true, 'userId is required'],
    },
    userEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    // A plain string, not a Mongoose "ref": the equipment lives in another service's
    // database, so this service can't join (populate) it.
    equipmentId: {
      type: String,
      required: [true, 'equipmentId is required'],
    },
    // Copied from the equipment service when the loan is created (denormalized on purpose):
    // listing loans never has to call that service, and a loan keeps the name it had.
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
    dueDate: { type: Date }, // set when an admin approves
    returnedAt: { type: Date }, // set when an admin marks the loan returned
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

// "My loans" and the active-loan checks filter by userId and status
loanSchema.index({ userId: 1, status: 1 });

// The overdue list filters by status and dueDate
loanSchema.index({ status: 1, dueDate: 1 });

// At most one active loan per user per item. This "partial" index only covers pending and
// approved loans, so ended loans don't count. It backs up the check in POST /loans when two
// requests arrive at the same moment, like a double-click. (Needs MongoDB 6 or newer.)
loanSchema.index(
  { userId: 1, equipmentId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'approved'] } } }
);

// The 3rd argument is the exact collection name ("loans")
module.exports = mongoose.model('Loan', loanSchema, 'loans');
