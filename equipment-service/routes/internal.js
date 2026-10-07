const express = require('express');
const Equipment = require('../models/Equipment');
const validateId = require('../middleware/validateId');

// Routes that only the loan service calls. The gateway never forwards /internal/* paths,
// and like every route in this service they need the internal key.
const router = express.Router();
router.param('id', validateId);

// PATCH /internal/equipment/:id/reserve: take one unit when a loan is created
router.patch('/internal/equipment/:id/reserve', async (req, res) => {
  // One atomic update: it only matches while at least one unit is available, and takes it
  // in the same step. Two loans racing for the last unit can't both get it.
  const equipment = await Equipment.findOneAndUpdate(
    { _id: req.params.id, availableQty: { $gt: 0 } },
    { $inc: { availableQty: -1 } },
    { new: true } // return the item as it is after the change
  );

  if (!equipment) {
    // Nothing matched: either the item doesn't exist, or it has no units left
    const exists = await Equipment.exists({ _id: req.params.id });
    if (!exists) {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    return res.status(409).json({ message: 'Out of stock' });
  }
  // The loan service copies equipment.name into the loan, so the whole item goes back
  res.json({ message: 'Reserved one unit', equipment });
});

// PATCH /internal/equipment/:id/release: give one unit back when a loan ends
router.patch('/internal/equipment/:id/release', async (req, res) => {
  // Atomic +1, but only while some units are out, so availableQty never passes totalQty
  const equipment = await Equipment.findOneAndUpdate(
    { _id: req.params.id, $expr: { $lt: ['$availableQty', '$totalQty'] } },
    { $inc: { availableQty: 1 } },
    { new: true }
  );

  if (!equipment) {
    const exists = await Equipment.exists({ _id: req.params.id });
    if (!exists) {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    return res.status(409).json({ message: 'Nothing to release: every unit is already in stock' });
  }
  res.json({ message: 'Released one unit', equipment });
});

module.exports = router;
