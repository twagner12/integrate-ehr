import { requireAuth, getAuth } from '@clerk/express';

// Protect any route - redirects or 401s if not logged in
export const requireSession = requireAuth();

// Restrict to staff only (role set in Clerk publicMetadata)
export const requireStaff = (req, res, next) => {
  const { sessionClaims } = getAuth(req);
  if (sessionClaims?.metadata?.role !== 'staff') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
};
