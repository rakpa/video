import { Router } from 'express';
import { getDownloadStats } from '../utils/downloadLogger.js';

const router = Router();

// Simple protection using ADMIN_TOKEN from .env
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me-in-env';

function requireAdmin(req: any, res: any, next: any) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  try {
    const stats = getDownloadStats();
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
