import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import path from 'path';
import { db } from '../db/index.js';

const uploadDir = path.resolve(import.meta.dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
});

const upload = multer({ storage });

const router = Router();

// GET /api/files?client_id=X
router.get('/', async (req, res, next) => {
  try {
    const { client_id } = req.query;
    if (!client_id) return res.status(400).json({ error: 'client_id is required' });
    const { rows } = await db.query(
      'SELECT * FROM files WHERE client_id = $1 ORDER BY created_at DESC',
      [client_id],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/files
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { client_id, category } = req.body;
    if (!client_id || !req.file) {
      return res.status(400).json({ error: 'client_id and file are required' });
    }
    const { rows } = await db.query(
      `INSERT INTO files (client_id, filename, original_name, mime_type, size_bytes, category, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        client_id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        category || 'Other',
        req.auth?.userId || null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/files/:id/download
router.get('/:id/download', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });
    const file = rows[0];
    const filePath = path.join(uploadDir, file.filename);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); }
});

// DELETE /api/files/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('DELETE FROM files WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadDir, rows[0].filename);
    await unlink(filePath).catch(() => {});
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
