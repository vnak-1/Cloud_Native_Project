const mongoose = require('mongoose');

// Used as router.param('id', validateId): Express runs it before every route that has
// ":id" in its path. A malformed id gets a clear 400 instead of a database error (500).
function validateId(req, res, next, id) {
  if (!mongoose.isObjectIdOrHexString(id)) {
    return res.status(400).json({ message: 'Invalid equipment id' });
  }
  next();
}

module.exports = validateId;
