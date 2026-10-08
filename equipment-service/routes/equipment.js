const express = require('express');
const Equipment = require('../models/Equipment');
const validateId = require('../middleware/validateId');

const router = express.Router();
router.param('id', validateId);

const CATEGORIES = Equipment.schema.path('category').enumValues;

function checkUpdate({ name, category, description, totalQty }) {
  if ([name, category, description, totalQty].every((value) => value === undefined)) {
    return 'Send at least one of: name, category, description, totalQty';
  }
  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    return 'name must be a non-empty string';
  }
  if (category !== undefined && !CATEGORIES.includes(category)) {
    return `category must be one of: ${CATEGORIES.join(', ')}`;
  }
  if (description !== undefined && typeof description !== 'string') {
    return 'description must be a string';
  }
  if (totalQty !== undefined && !(Number.isInteger(totalQty) && totalQty >= 1)) {
    return 'totalQty must be a whole number of at least 1';
  }
  return null;
}

function unitsOutMessage(item, action) {
  const out = item.totalQty - item.availableQty;
  return `${action}: ${out} unit(s) are reserved or lent out`;
}

router.post('/equipment', async (req, res) => {
  const { name, category, description, totalQty } = req.body ?? {};

  const equipment = await Equipment.create({
    name,
    category,
    description,
    totalQty,
    availableQty: totalQty,
  });
  res.status(201).json({ message: 'Equipment created', equipment });
});

router.get('/equipment', async (req, res) => {
  const filter = {};
  if (req.query.category !== undefined) {
    if (!CATEGORIES.includes(req.query.category)) {
      return res.status(400).json({ message: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    filter.category = req.query.category;
  }
  if (req.query.available === 'true') {
    filter.availableQty = { $gt: 0 };
  }

  const equipment = await Equipment.find(filter).sort({ name: 1 });
  res.json({ count: equipment.length, equipment });
});

router.get('/equipment/:id', async (req, res) => {
  const equipment = await Equipment.findById(req.params.id);
  if (!equipment) {
    return res.status(404).json({ message: 'Equipment not found' });
  }
  res.json({ equipment });
});

router.put('/equipment/:id', async (req, res) => {
  const { name, category, description, totalQty } = req.body ?? {};

  const problem = checkUpdate({ name, category, description, totalQty });
  if (problem) {
    return res.status(400).json({ message: problem });
  }

  const changes = {};
  if (name !== undefined) changes.name = { $literal: name.trim() };
  if (category !== undefined) changes.category = { $literal: category };
  if (description !== undefined) changes.description = { $literal: description.trim() };

  const filter = { _id: req.params.id };
  if (totalQty !== undefined) {
    filter.$expr = { $gte: [totalQty, { $subtract: ['$totalQty', '$availableQty'] }] };
    changes.availableQty = { $add: ['$availableQty', { $subtract: [totalQty, '$totalQty'] }] };
    changes.totalQty = totalQty;
  }

  const equipment = await Equipment.findOneAndUpdate(filter, [{ $set: changes }], { new: true });

  if (!equipment) {
    const current = await Equipment.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    return res.status(409).json({ message: unitsOutMessage(current, `Can't set totalQty to ${totalQty}`) });
  }
  res.json({ message: 'Equipment updated', equipment });
});

router.delete('/equipment/:id', async (req, res) => {
  const equipment = await Equipment.findOneAndDelete({
    _id: req.params.id,
    $expr: { $eq: ['$availableQty', '$totalQty'] },
  });

  if (!equipment) {
    const current = await Equipment.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    return res.status(409).json({ message: unitsOutMessage(current, "Can't delete") });
  }
  res.json({ message: 'Equipment deleted', equipment });
});

module.exports = router;
