// Middleware is a function Express runs before the route handler, like a Flask
// before_request hook. It either answers the request itself (and stops it there) or calls
// next() to pass the request on.
//
// Only the gateway knows INTERNAL_KEY (besides the other internal services). A request
// without the right x-internal-key header didn't come through the gateway, so it's refused.
// server.js refuses to start without INTERNAL_KEY, so it's never undefined here.
function internalOnly(req, res, next) {
  if (req.get('x-internal-key') !== process.env.INTERNAL_KEY) {
    return res
      .status(403)
      .json({ message: 'Direct access is not allowed. Send requests through the API gateway.' });
  }
  next();
}

module.exports = internalOnly;
