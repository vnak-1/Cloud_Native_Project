const jwt = require('jsonwebtoken');

// Builds the middleware for one route of the route table: it checks the JWT and the
// caller's role before the request is forwarded. This is the only place in the system that
// checks tokens; the services behind the gateway trust the x-user-* headers it sends.
function authorize(roles) {
  return (req, res, next) => {
    if (roles === 'public') {
      return next();
    }

    // Expect the header "Authorization: Bearer <token>"
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return res.status(401).json({ message: 'Token missing: send Authorization: Bearer <token>' });
    }

    try {
      // Checks the signature and the expiry time. Only HS256 is accepted, so a token can't
      // ask for a weaker algorithm.
      req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired: log in again' });
      }
      return res.status(401).json({ message: 'Invalid token' });
    }
    // Signed with our secret but not a login token (no user id or role in it)
    if (!req.user.id || !req.user.role) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Access denied: ${roles.join(' or ')} role required` });
    }
    next();
  };
}

module.exports = authorize;
