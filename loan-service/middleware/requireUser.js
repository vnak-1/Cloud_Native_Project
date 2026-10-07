// The gateway checks the JWT, then tells this service who the caller is in x-user-*
// headers. They can be trusted because only requests with the internal key (from the
// gateway) get this far. This puts the caller on req.user for the routes.
function requireUser(req, res, next) {
  const id = req.get('x-user-id');
  if (!id) {
    return res.status(401).json({ message: 'Missing x-user-id header (the gateway sets it)' });
  }
  req.user = { id, role: req.get('x-user-role'), email: req.get('x-user-email') };
  next();
}

module.exports = requireUser;
