import { requireAuth, getAuth } from '@clerk/express';

// Protect any route - 401 if not logged in
export const requireSession = requireAuth();

// Get the role from the session token
export const getRole = (req) => {
  const { sessionClaims } = getAuth(req);
  return sessionClaims?.metadata?.role;
};

// Restrict to admin only
export const requireAdmin = (req, res, next) => {
  if (getRole(req) !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Restrict to staff or admin
export const requireStaff = (req, res, next) => {
  const role = getRole(req);
  if (role !== 'staff' && role !== 'admin') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
};

// Restrict to parent portal users
export const requireParent = (req, res, next) => {
  if (getRole(req) !== 'parent') {
    return res.status(403).json({ error: 'Parent portal access required' });
  }
  next();
};
