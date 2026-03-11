import { Router } from 'express';
import { requireSession, requireStaff } from '../middleware/auth.js';
import clientsRouter from './clients.js';
import cliniciansRouter from './clinicians.js';
import peopleRouter from './people.js';
import appointmentsRouter from './appointments.js';
import servicesRouter from './services.js';

const router = Router();

router.use(requireSession);

router.use('/clients',      requireStaff, clientsRouter);
router.use('/clinicians',   requireStaff, cliniciansRouter);
router.use('/people',       requireStaff, peopleRouter);
router.use('/appointments', requireStaff, appointmentsRouter);
router.use('/services',     requireStaff, servicesRouter);

router.get('/ping', (req, res) => res.json({ message: 'API ready' }));

export default router;
