function internalOnly(req, res, next) {
  if (req.get('x-internal-key') !== process.env.INTERNAL_KEY) {
    return res
      .status(403)
      .json({ message: 'Direct access is not allowed. Send requests through the API gateway.' });
  }
  next();
}

module.exports = internalOnly;
