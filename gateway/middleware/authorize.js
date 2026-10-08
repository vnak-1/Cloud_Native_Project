const jwt = require('jsonwebtoken');

function authorize(roles) {
  return (req, res, next) => {
    if (roles === 'public') {
      return next();
    }

    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return res.status(401).json({ message: 'Token missing: send Authorization: Bearer <token>' });
    }

    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired: log in again' });
      }
      return res.status(401).json({ message: 'Invalid token' });
    }
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
