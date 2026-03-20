import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// ── GET /api/reports/aging ──────────────────────────────────────────────────
router.get('/aging', async (req, res, next) => {
  try {
    const { clinician_id } = req.query;
    const conditions = [`i.status != 'Paid'`];
    const params = [];

    if (clinician_id) { params.push(clinician_id); conditions.push(`c.primary_clinician_id = $${params.length}`); }

    const { rows } = await db.query(`
      SELECT
        c.id AS client_id,
        c.full_name AS client_name,
        cl.full_name AS clinician_name,
        COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.total - i.amount_paid ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.due_date >= CURRENT_DATE - 30 THEN i.total - i.amount_paid ELSE 0 END), 0) AS past_30,
        COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 30 AND i.due_date >= CURRENT_DATE - 60 THEN i.total - i.amount_paid ELSE 0 END), 0) AS past_60,
        COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 60 THEN i.total - i.amount_paid ELSE 0 END), 0) AS past_61_plus,
        COALESCE(SUM(i.total - i.amount_paid), 0) AS total_balance
      FROM invoices i
      JOIN clients c ON c.id = i.client_id
      LEFT JOIN clinicians cl ON cl.id = c.primary_clinician_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.id, c.full_name, cl.full_name
      HAVING SUM(i.total - i.amount_paid) > 0
      ORDER BY total_balance DESC
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/reports/clinician-invoicing ─────────────────────────────────────
router.get('/clinician-invoicing', async (req, res, next) => {
  try {
    const { start, end, clinician_id } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end are required' });

    const conditions = [
      `a.starts_at >= $1`,
      `a.starts_at <= $2`,
      `a.status IN ('Show', 'No Show', 'Late Cancel')`,
    ];
    const params = [start, end + 'T23:59:59'];

    if (clinician_id) { params.push(clinician_id); conditions.push(`cl.id = $${params.length}`); }

    const { rows } = await db.query(`
      SELECT
        cl.id AS clinician_id,
        cl.full_name AS clinician_name,
        COUNT(DISTINCT a.id) AS total_appointments,
        COALESCE(SUM(a.fee), 0) AS total_fees,
        COALESCE(SUM(CASE WHEN a.billing_status IN ('Invoiced', 'Paid') THEN a.fee ELSE 0 END), 0) AS invoiced,
        COALESCE(SUM(CASE WHEN a.billing_status = 'Uninvoiced' THEN a.fee ELSE 0 END), 0) AS uninvoiced
      FROM appointments a
      JOIN clinicians cl ON cl.id = a.clinician_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY cl.id, cl.full_name
      ORDER BY cl.full_name
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/reports/attendance ──────────────────────────────────────────────
router.get('/attendance', async (req, res, next) => {
  try {
    const { start, end, client_id, clinician_id, status } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end are required' });

    const conditions = [`a.starts_at >= $1`, `a.starts_at <= $2`];
    const params = [start, end + 'T23:59:59'];

    if (client_id)    { params.push(client_id);    conditions.push(`a.client_id = $${params.length}`); }
    if (clinician_id) { params.push(clinician_id); conditions.push(`a.clinician_id = $${params.length}`); }
    if (status)       { params.push(status);       conditions.push(`a.status = $${params.length}`); }

    const { rows } = await db.query(`
      SELECT
        a.id,
        c.full_name AS client_name,
        cl.full_name AS clinician_name,
        a.starts_at,
        a.location,
        a.status
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN clinicians cl ON cl.id = a.clinician_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.starts_at ASC
    `, params);

    // Build summary
    const clientSet = new Set();
    const clinicianSet = new Set();
    const statuses = {};
    for (const row of rows) {
      clientSet.add(row.client_name);
      clinicianSet.add(row.clinician_name);
      statuses[row.status] = (statuses[row.status] || 0) + 1;
    }

    res.json({
      rows,
      summary: {
        total_appointments: rows.length,
        total_clients: clientSet.size,
        total_clinicians: clinicianSet.size,
        statuses,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/reports/dashboard ──────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      activeClients,
      upcomingAppointments,
      unpaidInvoices,
      uninvoicedSessions,
      monthlyRevenue,
      appointmentsToday,
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) AS count FROM clients WHERE status = 'Active'`),
      db.query(`SELECT COUNT(*) AS count FROM appointments WHERE starts_at >= now() AND status != 'Canceled'`),
      db.query(`SELECT COUNT(*) AS count, COALESCE(SUM(total - amount_paid), 0) AS total FROM invoices WHERE status != 'Paid'`),
      db.query(`SELECT COUNT(*) AS count FROM appointments WHERE billing_status = 'Uninvoiced' AND status IN ('Show', 'No Show', 'Late Cancel')`),
      db.query(`SELECT COALESCE(SUM(amount_paid), 0) AS total FROM invoices WHERE status = 'Paid' AND paid_at >= date_trunc('month', CURRENT_DATE)`),
      db.query(`SELECT COUNT(*) AS count FROM appointments WHERE starts_at::date = CURRENT_DATE`),
    ]);

    res.json({
      active_clients: parseInt(activeClients.rows[0].count),
      upcoming_appointments: parseInt(upcomingAppointments.rows[0].count),
      unpaid_invoices: {
        count: parseInt(unpaidInvoices.rows[0].count),
        total: parseFloat(unpaidInvoices.rows[0].total),
      },
      uninvoiced_sessions: parseInt(uninvoicedSessions.rows[0].count),
      monthly_revenue: parseFloat(monthlyRevenue.rows[0].total),
      appointments_today: parseInt(appointmentsToday.rows[0].count),
    });
  } catch (err) { next(err); }
});

export default router;
