const express = require('express');
const Equipment = require('../models/Equipment');
const validateId = require('../middleware/validateId');

// A Router is a group of routes that server.js plugs in with app.use().
// The gateway decides who may call which route (admin or user); this service trusts it.
const router = express.Router();
router.param('id', validateId);

// The allowed categories, read from the schema so the list lives in one place
const CATEGORIES = Equipment.schema.path('category').enumValues;

// Checks the input for PUT. Returns an error message, or null when everything is fine.
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

// Builds the 409 message when units are still out
function unitsOutMessage(item, action) {
  const out = item.totalQty - item.availableQty;
  return `${action}: ${out} unit(s) are reserved or lent out`;
}

// POST /equipment: add an item to the inventory
router.post('/equipment', async (req, res) => {
  // Destructuring: take these fields out of the body (like a, b = d["a"], d["b"]).
  // req.body is undefined when no JSON body was sent, so fall back to {}.
  const { name, category, description, totalQty } = req.body ?? {};

  // Every unit starts in stock, so availableQty = totalQty. An availableQty sent by the
  // client is ignored, because we never read it.
  const equipment = await Equipment.create({
    name,
    category,
    description,
    totalQty,
    availableQty: totalQty,
  });
  res.status(201).json({ message: 'Equipment created', equipment });
});

// GET /equipment: list items, optionally filtered
//   ?category=camera   only that category
//   ?available=true    only items with at least one unit in stock
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

// GET /equipment/:id: one item
router.get('/equipment/:id', async (req, res) => {
  const equipment = await Equipment.findById(req.params.id);
  if (!equipment) {
    return res.status(404).json({ message: 'Equipment not found' });
  }
  res.json({ equipment });
});

// PUT /equipment/:id: change name, category, description and/or totalQty.
// availableQty is never set directly. It only moves when totalQty changes, or when a loan
// reserves or releases a unit.
router.put('/equipment/:id', async (req, res) => {
  const { name, category, description, totalQty } = req.body ?? {};

  // The update below is a "pipeline" update, and Mongoose doesn't run schema validators on
  // those, so the input is checked here first.
  const problem = checkUpdate({ name, category, description, totalQty });
  if (problem) {
    return res.status(400).json({ message: problem });
  }

  // The new values. $literal makes MongoDB store text exactly as sent, even if it starts
  // with "$" (which a pipeline would otherwise read as a field name).
  const changes = {};
  if (name !== undefined) changes.name = { $literal: name.trim() };
  if (category !== undefined) changes.category = { $literal: category };
  if (description !== undefined) changes.description = { $literal: description.trim() };

  const filter = { _id: req.params.id };
  if (totalQty !== undefined) {
    // Units out right now = totalQty - availableQty. Only match the item if the new total
    // still covers them; otherwise nothing changes and we answer 409 below.
    filter.$expr = { $gte: [totalQty, { $subtract: ['$totalQty', '$availableQty'] }] };
    // Shift availableQty by the same amount as the total. Inside one $set stage,
    // '$totalQty' and '$availableQty' still mean the old values.
    changes.availableQty = { $add: ['$availableQty', { $subtract: [totalQty, '$totalQty'] }] };
    changes.totalQty = totalQty;
  }

  // One atomic update: MongoDB checks and changes the item in a single step, so a loan
  // reserving a unit at the same moment can't slip in between (no read-then-write).
  const equipment = await Equipment.findOneAndUpdate(filter, [{ $set: changes }], { new: true });

  if (!equipment) {
    // Nothing matched: the item doesn't exist, or the new total is too low
    const current = await Equipment.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    return res.status(409).json({ message: unitsOutMessage(current, `Can't set totalQty to ${totalQty}`) });
  }
  res.json({ message: 'Equipment updated', equipment });
});

// DELETE /equipment/:id: remove an item, but only when every unit is back in stock
router.delete('/equipment/:id', async (req, res) => {
  // The "all units in stock" check and the delete are one atomic operation, so a loan
  // can't reserve a unit between the check and the delete.
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
