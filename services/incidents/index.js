const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.INCIDENT_SERVICE_PORT || 4004;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4005';

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

// ─── Notify helper ───────────────────────────────────────────
async function sendNotification(token, data) {
  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL}/notifications`, data, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 3000,
    });
  } catch (err) {
    console.warn('⚠️  Could not send notification:', err.message);
  }
}

// ─── Validation ──────────────────────────────────────────────
const incidentValidation = [
  body('title').trim().notEmpty().withMessage('Titre requis'),
  body('type').isIn(['ACCIDENT', 'CONSTRUCTION', 'ROAD_CLOSED', 'TRAFFIC_JAM']).withMessage('Type invalide'),
  body('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('zone_id').optional().isInt(),
];

// ─── Routes ─────────────────────────────────────────────────

// POST /incidents - Declare incident
app.post('/incidents', authenticate, incidentValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, type, severity = 'MEDIUM', latitude, longitude, zone_id } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO incidents (title, description, type, severity, latitude, longitude, zone_id, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, type, severity, latitude, longitude, zone_id, req.user.id]
    );

    const [incident] = await pool.query('SELECT * FROM incidents WHERE id = ?', [result.insertId]);

    // Send notification to all admins
    const typeLabels = {
      ACCIDENT: 'Accident', CONSTRUCTION: 'Travaux',
      ROAD_CLOSED: 'Route fermée', TRAFFIC_JAM: 'Embouteillage'
    };
    await sendNotification(req.headers.authorization.split(' ')[1], {
      title: `🚨 Nouvel Incident: ${typeLabels[type]}`,
      message: `${title} - Signalé par ${req.user.username}`,
      type: 'INCIDENT',
      priority: severity === 'CRITICAL' || severity === 'HIGH' ? 'URGENT' : 'HIGH',
      recipient_role: 'ADMIN',
      reference_type: 'incident',
      reference_id: result.insertId,
    });

    res.status(201).json({ message: 'Incident déclaré', incident: incident[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /incidents - List incidents
app.get('/incidents', authenticate, async (req, res) => {
  try {
    const { type, status, severity, zone_id, page = 1, limit = 20 } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (type) { whereClause += ' AND i.type = ?'; params.push(type); }
    if (status) { whereClause += ' AND i.status = ?'; params.push(status); }
    if (severity) { whereClause += ' AND i.severity = ?'; params.push(severity); }
    if (zone_id) { whereClause += ' AND i.zone_id = ?'; params.push(zone_id); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [incidents] = await pool.query(
      `SELECT i.*, z.name as zone_name 
       FROM incidents i LEFT JOIN traffic_zones z ON z.id = i.zone_id
       ${whereClause} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM incidents i ${whereClause}`, params
    );

    res.json({ incidents, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /incidents/:id
app.get('/incidents/:id', authenticate, async (req, res) => {
  try {
    const [incidents] = await pool.query(
      `SELECT i.*, z.name as zone_name 
       FROM incidents i LEFT JOIN traffic_zones z ON z.id = i.zone_id
       WHERE i.id = ?`,
      [req.params.id]
    );
    if (incidents.length === 0) return res.status(404).json({ error: 'Incident non trouvé' });

    const [updates] = await pool.query(
      'SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ incident: incidents[0], history: updates });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /incidents/:id/status - Update status
app.put('/incidents/:id/status', authenticate,
  [
    body('status').isIn(['REPORTED', 'IN_PROGRESS', 'RESOLVED']).withMessage('Statut invalide'),
    body('message').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, message } = req.body;

    try {
      const [incidents] = await pool.query('SELECT * FROM incidents WHERE id = ?', [req.params.id]);
      if (incidents.length === 0) return res.status(404).json({ error: 'Incident non trouvé' });

      const incident = incidents[0];
      const old_status = incident.status;

      const resolved_at = status === 'RESOLVED' ? new Date() : null;

      await pool.query(
        'UPDATE incidents SET status = ?, resolved_at = ? WHERE id = ?',
        [status, resolved_at, req.params.id]
      );

      // Record update history
      await pool.query(
        `INSERT INTO incident_updates (incident_id, message, old_status, new_status, updated_by)
         VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, message || `Statut changé: ${old_status} → ${status}`, old_status, status, req.user.id]
      );

      const [updated] = await pool.query('SELECT * FROM incidents WHERE id = ?', [req.params.id]);

      // Notify about status change
      await sendNotification(req.headers.authorization.split(' ')[1], {
        title: `📋 Incident #${req.params.id} mis à jour`,
        message: `Statut: ${status} - ${incident.title}`,
        type: 'INCIDENT',
        priority: 'NORMAL',
        recipient_role: 'ALL',
        reference_type: 'incident',
        reference_id: parseInt(req.params.id),
      });

      res.json({ message: 'Statut mis à jour', incident: updated[0] });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// PUT /incidents/:id - Full update
app.put('/incidents/:id', authenticate, incidentValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, type, severity, latitude, longitude, zone_id, assigned_to } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE incidents SET title=?, description=?, type=?, severity=?, latitude=?, longitude=?,
       zone_id=?, assigned_to=? WHERE id=?`,
      [title, description, type, severity, latitude, longitude, zone_id, assigned_to, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Incident non trouvé' });
    const [updated] = await pool.query('SELECT * FROM incidents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Incident mis à jour', incident: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /incidents/stats/summary
app.get('/incidents/stats/summary', authenticate, async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'REPORTED' THEN 1 ELSE 0 END) as reported,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN type = 'ACCIDENT' THEN 1 ELSE 0 END) as accidents,
        SUM(CASE WHEN type = 'CONSTRUCTION' THEN 1 ELSE 0 END) as constructions,
        SUM(CASE WHEN type = 'ROAD_CLOSED' THEN 1 ELSE 0 END) as road_closures,
        SUM(CASE WHEN type = 'TRAFFIC_JAM' THEN 1 ELSE 0 END) as traffic_jams,
        SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical
      FROM incidents
    `);
    res.json({ stats: stats[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/health', (req, res) => res.json({ service: 'incidents', status: 'OK', timestamp: new Date().toISOString() }));

pool.getConnection()
  .then(conn => { console.log('✅ Incident Service: DB connected'); conn.release(); })
  .catch(err => { console.error('❌ Incident Service: DB failed:', err.message); process.exit(1); });

app.listen(PORT, () => console.log(`⚠️  Incident Service running on port ${PORT}`));
module.exports = {
  app,
  createIncident,
  updateIncidentStatus,
  validateSeverity,
  validateIncidentType,
  getIncidentsByArea
};