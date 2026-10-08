const express = require('express');
const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const validateId = require('../middleware/validateId');
const equipment = require('../lib/equipmentClient');

const router = express.Router();
router.param('id', validateId);

const STATUSES = Loan.schema.path('status').enumValues;
const ACTIVE = ['pending', 'approved'];
const MAX_ACTIVE_LOANS = 3;

function logError(message) {
  console.error(`[${process.env.SERVICE_NAME}] ${message}`);
}

async function releaseUnit(equipmentId) {
  try {
    const { status } = await equipment.release(equipmentId);
    if (status === 200 || status === 409) {
      return true;
    }
    logError(`Release of equipment ${equipmentId} failed with status ${status}`);
  } catch (err) {
    logError(`Release of equipment ${equipmentId} failed: ${err.message}`);
  }
  return false;
}

router.post('/loans', async (req, res) => {
  const { equipmentId: rawId, days } = req.body ?? {};
  const { id: userId, email: userEmail } = req.user;

  if (!mongoose.isObjectIdOrHexString(rawId)) {
    return res.status(400).json({ message: 'equipmentId is missing or not a valid id' });
  }
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return res.status(400).json({ message: 'days must be a whole number from 1 to 7' });
  }
  const equipmentId = rawId.toLowerCase();

  const activeLoans = await Loan.find({ userId, status: { $in: ACTIVE } }).select('equipmentId');
  if (activeLoans.length >= MAX_ACTIVE_LOANS) {
    return res
      .status(409)
      .json({ message: `You already have ${MAX_ACTIVE_LOANS} active loans (pending or approved)` });
  }
  if (activeLoans.some((loan) => loan.equipmentId === equipmentId)) {
    return res.status(409).json({ message: 'You already have an active loan for this item' });
  }

  let reserved;
  try {
    reserved = await equipment.reserve(equipmentId);
  } catch (err) {
    logError(`Reserve of equipment ${equipmentId} failed: ${err.message}`);
    return res.status(503).json({ message: 'Equipment service unavailable' });
  }
  if (reserved.status === 404 || reserved.status === 409) {
    return res.status(reserved.status).json({ message: reserved.body.message });
  }
  if (reserved.status !== 200) {
    logError(`Reserve of equipment ${equipmentId} returned status ${reserved.status}`);
    return res.status(503).json({ message: 'Equipment service unavailable' });
  }

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
    const released = await releaseUnit(equipmentId);
    logError(
      released
        ? `Loan save failed (${err.message}). Compensation: released the unit of equipment ${equipmentId}`
        : `Loan save failed (${err.message}) and the release failed too: equipment ${equipmentId} has one unit stuck as reserved`
    );
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You already have an active loan for this item' });
    }
    res.status(500).json({ message: 'Could not save the loan' });
  }
});

router.get('/loans/me', async (req, res) => {
  const loans = await Loan.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json({ count: loans.length, loans });
});

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

router.get('/loans/overdue', async (req, res) => {
  const loans = await Loan.find({ status: 'approved', dueDate: { $lt: new Date() } }).sort({ dueDate: 1 });
  res.json({ count: loans.length, loans });
});

async function changeStatus(req, res, { from, update, releasesUnit = false, ownerOnly = false }) {
  const filter = { _id: req.params.id, status: from };
  if (ownerOnly) {
    filter.userId = req.user.id;
  }
  const loan = await Loan.findOneAndUpdate(filter, update, { new: true });

  if (!loan) {
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

router.patch('/loans/:id/approve', (req, res) =>
  changeStatus(req, res, {
    from: 'pending',
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

router.patch('/loans/:id/reject', (req, res) =>
  changeStatus(req, res, {
    from: 'pending',
    update: { $set: { status: 'rejected' } },
    releasesUnit: true,
  })
);

router.patch('/loans/:id/cancel', (req, res) =>
  changeStatus(req, res, {
    from: 'pending',
    update: { $set: { status: 'cancelled' } },
    releasesUnit: true,
    ownerOnly: true,
  })
);

router.patch('/loans/:id/return', (req, res) =>
  changeStatus(req, res, {
    from: 'approved',
    update: { $set: { status: 'returned', returnedAt: new Date() } },
    releasesUnit: true,
  })
);

module.exports = router;
