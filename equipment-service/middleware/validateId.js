const mongoose = require('mongoose');

function validateId(req, res, next, id) {
  if (!mongoose.isObjectIdOrHexString(id)) {
    return res.status(400).json({ message: 'Invalid equipment id' });
  }
  next();
}

module.exports = validateId;
