const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.NOTIFICATION_SERVICE_PORT || 4005;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'urban_traffic',
  waitForConnections: true,
  connectionLimit: 10,
});

// ─── Auth Middleware ─────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requis' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

// ─── Validation ──────────────────────────────────────────────
const notificationValidation = [
  body('title').trim().notEmpty().withMessage('Titre requis'),
  body('message').trim().notEmpty().withMessage('Message requis'),
  body('type').optional().isIn(['INCIDENT', 'TRAFFIC', 'SYSTEM', 'ALERT']),
  body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
];

// ─── Routes ─────────────────────────────────────────────────

// POST /notifications - Send notification
app.post('/notifications', authenticate, notificationValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    title, message, type = 'SYSTEM', priority = 'NORMAL',
    recipient_id, recipient_role, reference_type, reference_id
  } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO notifications (title, message, type, priority, recipient_id, recipient_role, reference_type, reference_id, sent_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, message, type, priority, recipient_id, recipient_role, reference_type, reference_id, req.user.id]
    );

    const [notification] = await pool.query('SELECT * FROM notifications WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Notification envoyée', notification: notification[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /notifications - Get notifications for current user
app.get('/notifications', authenticate, async (req, res) => {
  try {
    const { is_read, type, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = `WHERE (
      recipient_id = ? OR 
      recipient_role = ? OR 
      recipient_role = 'ALL'
    )`;
    const params = [req.user.id, req.user.role];

    if (is_read !== undefined) {
      whereClause += ' AND is_read = ?';
      params.push(is_read === 'true');
    }
    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    const [notifications] = await pool.query(
      `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM notifications ${whereClause}`, params
    );

    const [[{ unread }]] = await pool.query(
      `SELECT COUNT(*) as unread FROM notifications ${whereClause} AND is_read = FALSE`,
      params
    );

    res.json({ notifications, total, unread, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /notifications/:id
app.get('/notifications/:id', authenticate, async (req, res) => {
  try {
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE id = ?', [req.params.id]
    );
    if (notifications.length === 0) return res.status(404).json({ error: 'Notification non trouvée' });
    res.json({ notification: notifications[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /notifications/:id/read - Mark as read
app.patch('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification non trouvée' });
    const [updated] = await pool.query('SELECT * FROM notifications WHERE id = ?', [req.params.id]);
    res.json({ message: 'Notification marquée comme lue', notification: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /notifications/read-all - Mark all as read
app.patch('/notifications/read-all/mark', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE (recipient_id = ? OR recipient_role = ? OR recipient_role = 'ALL') AND is_read = FALSE`,
      [req.user.id, req.user.role]
    );
    res.json({ message: `${result.affectedRows} notification(s) marquée(s) comme lues` });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /notifications/:id
app.delete('/notifications/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM notifications WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification non trouvée' });
    res.json({ message: 'Notification supprimée' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/health', (req, res) => res.json({ service: 'notifications', status: 'OK', timestamp: new Date().toISOString() }));

pool.getConnection()
  .then(conn => { console.log('✅ Notification Service: DB connected'); conn.release(); })
  .catch(err => { console.error('❌ Notification Service: DB failed:', err.message); process.exit(1); });

app.listen(PORT, () => console.log(`🔔 Notification Service running on port ${PORT}`));
