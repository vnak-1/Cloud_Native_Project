const mongoose = require('mongoose');

const CATEGORIES = ['camera', 'laptop', 'audio', 'projector', 'other'];

const equipmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
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
          validator: function (value) {
            return value <= this.totalQty;
          },
          message: 'availableQty cannot be more than totalQty',
        },
      ],
    },
  },
  { timestamps: true }
);

equipmentSchema.index({ category: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema, 'equipment');
