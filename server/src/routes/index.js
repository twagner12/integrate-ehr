import { Router } from 'express';
import { requireSession, requireStaff } from '../middleware/auth.js';
import clientsRouter      from './clients.js';
import cliniciansRouter   from './clinicians.js';
import peopleRouter       from './people.js';
import appointmentsRouter from './appointments.js';
import servicesRouter     from './services.js';
import notesRouter        from './notes.js';
import settingsRouter     from './settings.js';
import profileRouter from './profile.js';
import invoicesRouter  from './invoices.js';
import paymentsRouter from './payments.js';
import portalRouter from './portal.js';

const router = Router();

router.use(requireSession);

router.use('/clients',      requireStaff, clientsRouter);
router.use('/clinicians',   requireStaff, cliniciansRouter);
router.use('/people',       requireStaff, peopleRouter);
router.use('/appointments', requireStaff, appointmentsRouter);
router.use('/services',     requireStaff, servicesRouter);
router.use('/notes',                      notesRouter);
router.use('/settings',     requireStaff, settingsRouter);
router.use('/profile',                    profileRouter);
router.use('/invoices',    requireStaff, invoicesRouter);
router.use('/payments',   requireStaff, paymentsRouter);
router.use('/portal',                 portalRouter);

router.get('/ping', (req, res) => res.json({ message: 'API ready' }));

export default router;
