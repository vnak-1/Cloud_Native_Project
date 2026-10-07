const mongoose = require('mongoose');

const CATEGORIES = ['camera', 'laptop', 'audio', 'projector', 'other'];

// The schema says what one document looks like and which values are allowed. Mongoose
// checks these rules before saving; a broken rule becomes a ValidationError (400).
const equipmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      // Creates a unique index in MongoDB. A duplicate name fails with error code 11000,
      // which the error handler turns into 409.
      unique: true,
    },
    category: {
      type: String,
      required: [true, 'category is required'],
      enum: { values: CATEGORIES, message: `category must be one of: ${CATEGORIES.join(', ')}` },
    },
    description: {
      type: String,
      trim: true,
    },
    totalQty: {
      type: Number,
      required: [true, 'totalQty is required'],
      min: [1, 'totalQty must be at least 1'],
      validate: { validator: Number.isInteger, message: 'totalQty must be a whole number' },
    },
    availableQty: {
      type: Number,
      min: [0, 'availableQty cannot be negative'],
      validate: [
        { validator: Number.isInteger, message: 'availableQty must be a whole number' },
        {
          // A regular "function" (not an arrow function) so that "this" is the document
          // being saved, which lets us compare with its totalQty.
          validator: function (value) {
            return value <= this.totalQty;
          },
          message: 'availableQty cannot be more than totalQty',
        },
      ],
    },
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

// Index on category, so "?category=camera" doesn't have to scan the whole collection
equipmentSchema.index({ category: 1 });

// The 3rd argument is the exact collection name. Without it, Mongoose would name the
// collection "equipments" (it pluralizes the model name).
module.exports = mongoose.model('Equipment', equipmentSchema, 'equipment');
