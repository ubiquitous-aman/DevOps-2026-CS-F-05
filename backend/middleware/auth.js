const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * protect: verifies JWT from the Authorization: Bearer <token> header
 * and attaches the authenticated user (minus password) to req.user
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ success: false, message: 'User no longer exists' });
      }
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account has been deactivated. Contact admin.' });
      }

      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Not authorized, invalid or expired token' });
    }
  } else {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }
};

/**
 * authorize(...roles): restricts a route to specific roles.
 * Usage: router.get('/x', protect, authorize('admin','tpo'), handler)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not permitted to access this resource`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
