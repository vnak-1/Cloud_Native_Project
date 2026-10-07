const express = require('express');
const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const validateId = require('../middleware/validateId');
const equipment = require('../lib/equipmentClient');

// The gateway decides who may call which route (admin or user). requireUser (in server.js)
// has already put the caller's id from x-user-id on req.user.
const router = express.Router();
router.param('id', validateId);

const STATUSES = Loan.schema.path('status').enumValues;
const ACTIVE = ['pending', 'approved']; // the loans that are holding a unit
const MAX_ACTIVE_LOANS = 3;

function logError(message) {
  console.error(`[${process.env.SERVICE_NAME}] ${message}`);
}

// Gives one unit back to the equipment service. Returns true once the unit is back in stock.
async function releaseUnit(equipmentId) {
  try {
    const { status } = await equipment.release(equipmentId);
    // 409 means every unit is already in stock: the unit is back, so that counts as done
    if (status === 200 || status === 409) {
      return true;
    }
    logError(`Release of equipment ${equipmentId} failed with status ${status}`);
  } catch (err) {
    logError(`Release of equipment ${equipmentId} failed: ${err.message}`);
  }
  return false;
}

// POST /loans (user): ask to borrow one unit of an item for 1 to 7 days.
// This is where the two services must stay consistent, so it runs in four steps.
router.post('/loans', async (req, res) => {
  const { equipmentId: rawId, days } = req.body ?? {};
  const { id: userId, email: userEmail } = req.user;

  // Step 1: check the input and the business rules, using only our own database
  if (!mongoose.isObjectIdOrHexString(rawId)) {
    return res.status(400).json({ message: 'equipmentId is missing or not a valid id' });
  }
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return res.status(400).json({ message: 'days must be a whole number from 1 to 7' });
  }
  // Hex ids can also be written in capitals. Keep one spelling, so the "same item" check
  // and the unique index can't be dodged that way.
  const equipmentId = rawId.toLowerCase();

  // (Two requests at the very same moment could both pass the 3-loan check. The unique
  // index in models/Loan.js guards the same-item rule against that; the 3-loan limit
  // accepts this small gap.)
  const activeLoans = await Loan.find({ userId, status: { $in: ACTIVE } }).select('equipmentId');
  if (activeLoans.length >= MAX_ACTIVE_LOANS) {
    return res
      .status(409)
      .json({ message: `You already have ${MAX_ACTIVE_LOANS} active loans (pending or approved)` });
  }
  if (activeLoans.some((loan) => loan.equipmentId === equipmentId)) {
    return res.status(409).json({ message: 'You already have an active loan for this item' });
  }

  // Step 2: reserve one unit in the equipment service (an atomic update over there)
  let reserved;
  try {
    reserved = await equipment.reserve(equipmentId);
  } catch (err) {
    // Network error or the 3-second timeout: nothing was reserved, nothing was saved
    logError(`Reserve of equipment ${equipmentId} failed: ${err.message}`);
    return res.status(503).json({ message: 'Equipment service unavailable' });
  }
  if (reserved.status === 404 || reserved.status === 409) {
    // Unknown item or out of stock: pass the equipment service's answer through
    return res.status(reserved.status).json({ message: reserved.body.message });
  }
  if (reserved.status !== 200) {
    logError(`Reserve of equipment ${equipmentId} returned status ${reserved.status}`);
    return res.status(503).json({ message: 'Equipment service unavailable' });
  }

  // Step 3: save the loan, copying the item's name from the reserve response.
  // (?. gives undefined instead of an error if "equipment" is missing; then the schema's
  // "required" rule fails and step 4 runs.)
  try {
    const loan = await Loan.create({
      userId,
      userEmail,
      equipmentId,
      equipmentName: reserved.body.equipment?.name,
      days,
    });
    res.status(201).json({ message: 'Loan requested, waiting for approval', loan });
  } catch (err) {
    // Step 4: a unit is reserved but no loan was saved. Give the unit back (the
    // compensating action), so stock isn't held by a loan that doesn't exist.
    const released = await releaseUnit(equipmentId);
    logError(
      released
        ? `Loan save failed (${err.message}). Compensation: released the unit of equipment ${equipmentId}`
        : `Loan save failed (${err.message}) and the release failed too: equipment ${equipmentId} has one unit stuck as reserved`
    );
    if (err.code === 11000) {
      // The unique index caught a second active loan for the same item (a double-click)
      return res.status(409).json({ message: 'You already have an active loan for this item' });
    }
    res.status(500).json({ message: 'Could not save the loan' });
  }
});

// GET /loans/me (user): the caller's own loans, newest first
router.get('/loans/me', async (req, res) => {
  const loans = await Loan.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json({ count: loans.length, loans });
});

// GET /loans (admin): every loan, newest first. Optional filter: ?status=pending (etc.)
router.get('/loans', async (req, res) => {
  const filter = {};
  if (req.query.status !== undefined) {
    if (!STATUSES.includes(req.query.status)) {
      return res.status(400).json({ message: `status must be one of: ${STATUSES.join(', ')}` });
    }
    filter.status = req.query.status;
  }
  const loans = await Loan.find(filter).sort({ createdAt: -1 });
  res.json({ count: loans.length, loans });
});

// GET /loans/overdue (admin): approved loans whose dueDate has passed, most overdue first
router.get('/loans/overdue', async (req, res) => {
  const loans = await Loan.find({ status: 'approved', dueDate: { $lt: new Date() } }).sort({ dueDate: 1 });
  res.json({ count: loans.length, loans });
});

// Shared by approve, reject, cancel and return:
// 1. One atomic update that only matches the loan while it's in the expected status (and,
//    for cancel, owned by the caller). A double-click or a race (approve vs cancel) can
//    only succeed once; the other request finds nothing and gets 409.
// 2. When the loan ends (reject, cancel, return), give its unit back to the equipment
//    service. If that fails, put the old status back, so the loan and the stock still agree.
async function changeStatus(req, res, { from, update, releasesUnit = false, ownerOnly = false }) {
  const filter = { _id: req.params.id, status: from };
  if (ownerOnly) {
    filter.userId = req.user.id;
  }
  const loan = await Loan.findOneAndUpdate(filter, update, { new: true });

  if (!loan) {
    // Nothing matched: find out why, to send the right status code
    const current = await Loan.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    if (ownerOnly && current.userId !== req.user.id) {
      return res.status(403).json({ message: 'You can only cancel your own loans' });
    }
    return res.status(409).json({ message: `Loan is ${current.status}, but it must be ${from} for this` });
  }

  if (releasesUnit) {
    const released = await releaseUnit(loan.equipmentId);
    if (!released) {
      // Undo our status change (and returnedAt), so the loan matches the stock again
      try {
        await Loan.updateOne(
          { _id: loan._id, status: loan.status },
          { $set: { status: from }, $unset: { returnedAt: 1 } }
        );
      } catch (err) {
        logError(`Could not put loan ${loan._id} back to ${from}: ${err.message}`);
      }
      return res.status(503).json({ message: 'Equipment service unavailable, try again later' });
    }
  }
  res.json({ message: `Loan ${loan.status}`, loan });
}

// PATCH /loans/:id/approve (admin): pending -> approved, due "days" days from now
router.patch('/loans/:id/approve', (req, res) =>
  changeStatus(req, res, {
    from: 'pending',
    // A pipeline update, so dueDate can be worked out from the loan's own "days" inside
    // MongoDB ($$NOW is the database's clock). The whole change is still one atomic update.
    update: [
      {
        $set: {
          status: 'approved',
          dueDate: { $dateAdd: { startDate: '$$NOW', unit: 'day', amount: '$days' } },
        },
      },
    ],
  })
);

// PATCH /loans/:id/reject (admin): pending -> rejected, then give the unit back
router.patch('/loans/:id/reject', (req, res) =>
  changeStatus(req, res, {
    from: 'pending',
    update: { $set: { status: 'rejected' } },
    releasesUnit: true,
  })
);

// PATCH /loans/:id/cancel (user): the owner's pending loan -> cancelled, then give the unit back
router.patch('/loans/:id/cancel', (req, res) =>
  changeStatus(req, res, {
    from: 'pending',
    update: { $set: { status: 'cancelled' } },
    releasesUnit: true,
    ownerOnly: true,
  })
);

// PATCH /loans/:id/return (admin): approved -> returned, then give the unit back
router.patch('/loans/:id/return', (req, res) =>
  changeStatus(req, res, {
    from: 'approved',
    update: { $set: { status: 'returned', returnedAt: new Date() } },
    releasesUnit: true,
  })
);

module.exports = router;
