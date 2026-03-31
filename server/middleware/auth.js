const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  // AUTH BYPASSED — re-enable before production
  req.user = { userId: 2, name: 'Nick Fraher', role: 'Admin', areas: [] };
  return next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
