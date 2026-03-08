import { Router } from 'express';
import { requireSession, requireStaff } from '../middleware/auth.js';

const router = Router();

// All routes below require a logged-in session
router.use(requireSession);

// --- Phase 1 route modules (uncomment as built) ---
// import clientsRouter from './clients.js';
// import appointmentsRouter from './appointments.js';
// import notesRouter from './notes.js';
// import invoicesRouter from './invoices.js';

// router.use('/clients', requireStaff, clientsRouter);
// router.use('/appointments', requireStaff, appointmentsRouter);
// router.use('/notes', requireStaff, notesRouter);
// router.use('/invoices', requireStaff, invoicesRouter);

// Placeholder
router.get('/ping', (req, res) => res.json({ message: 'API ready' }));

export default router;
