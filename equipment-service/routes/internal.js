const express = require('express');
const Equipment = require('../models/Equipment');
const validateId = require('../middleware/validateId');

const router = express.Router();
router.param('id', validateId);

router.patch('/internal/equipment/:id/reserve', async (req, res) => {
  const equipment = await Equipment.findOneAndUpdate(
    { _id: req.params.id, availableQty: { $gt: 0 } },
    { $inc: { availableQty: -1 } },
    { new: true }
  );

  if (!equipment) {
    const exists = await Equipment.exists({ _id: req.params.id });
    if (!exists) {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    return res.status(409).json({ message: 'Out of stock' });
  }
  res.json({ message: 'Reserved one unit', equipment });
});

router.patch('/internal/equipment/:id/release', async (req, res) => {
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
