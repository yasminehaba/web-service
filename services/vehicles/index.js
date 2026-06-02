const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { body, query, validationResult } = require('express-validator');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.VEHICLE_SERVICE_PORT || 4002;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// DB Pool
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
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requis' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Accès réservé aux ADMIN' });
  }
  next();
};

// ─── Validation ──────────────────────────────────────────────
const vehicleValidation = [
  body('license_plate').trim().notEmpty().withMessage('Plaque d\'immatriculation requise'),
  body('type').isIn(['CAR', 'TRUCK', 'BUS', 'MOTORCYCLE', 'EMERGENCY']).withMessage('Type invalide'),
  body('brand').optional().trim(),
  body('model').optional().trim(),
  body('color').optional().trim(),
  body('owner_name').optional().trim(),
  body('owner_contact').optional().trim(),
];

const gpsValidation = [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide'),
  body('speed').optional().isFloat({ min: 0 }).withMessage('Vitesse invalide'),
  body('heading').optional().isFloat({ min: 0, max: 360 }).withMessage('Cap invalide'),
];

// ─── Routes: Vehicles ────────────────────────────────────────

// POST /vehicles
app.post('/vehicles', authenticate, vehicleValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { license_plate, type, brand, model, color, owner_name, owner_contact } = req.body;

  try {
    const [existing] = await pool.query(
      'SELECT id FROM vehicles WHERE license_plate = ?', [license_plate]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Plaque déjà enregistrée' });
    }

    const [result] = await pool.query(
      `INSERT INTO vehicles (license_plate, type, brand, model, color, owner_name, owner_contact, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [license_plate, type, brand, model, color, owner_name, owner_contact, req.user.id]
    );

    const [vehicle] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Véhicule ajouté', vehicle: vehicle[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /vehicles
app.get('/vehicles', authenticate, async (req, res) => {
  try {
    const { type, is_active, page = 1, limit = 20 } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (type) { whereClause += ' AND type = ?'; params.push(type); }
    if (is_active !== undefined) { whereClause += ' AND is_active = ?'; params.push(is_active === 'true'); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [vehicles] = await pool.query(
      `SELECT v.*, 
        (SELECT COUNT(*) FROM gps_positions WHERE vehicle_id = v.id) as position_count,
        (SELECT recorded_at FROM gps_positions WHERE vehicle_id = v.id ORDER BY recorded_at DESC LIMIT 1) as last_seen
       FROM vehicles v ${whereClause} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM vehicles ${whereClause}`, params
    );

    res.json({ vehicles, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /vehicles/:id
app.get('/vehicles/:id', authenticate, async (req, res) => {
  try {
    const [vehicles] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
    if (vehicles.length === 0) return res.status(404).json({ error: 'Véhicule non trouvé' });

    // Get last position
    const [positions] = await pool.query(
      'SELECT * FROM gps_positions WHERE vehicle_id = ? ORDER BY recorded_at DESC LIMIT 1',
      [req.params.id]
    );

    res.json({ vehicle: vehicles[0], last_position: positions[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /vehicles/:id
app.put('/vehicles/:id', authenticate, vehicleValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { license_plate, type, brand, model, color, owner_name, owner_contact, is_active } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE vehicles SET license_plate=?, type=?, brand=?, model=?, color=?,
       owner_name=?, owner_contact=?, is_active=? WHERE id=?`,
      [license_plate, type, brand, model, color, owner_name, owner_contact,
       is_active !== undefined ? is_active : true, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Véhicule non trouvé' });

    const [updated] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Véhicule mis à jour', vehicle: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /vehicles/:id (ADMIN only)
app.delete('/vehicles/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Véhicule non trouvé' });
    res.json({ message: 'Véhicule supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Routes: GPS Positions ───────────────────────────────────

// POST /vehicles/:id/positions - Add GPS position
app.post('/vehicles/:id/positions', authenticate, gpsValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { latitude, longitude, speed = 0, heading = 0, altitude = 0 } = req.body;

  try {
    const [vehicles] = await pool.query('SELECT id FROM vehicles WHERE id = ? AND is_active = TRUE', [req.params.id]);
    if (vehicles.length === 0) return res.status(404).json({ error: 'Véhicule non trouvé' });

    const [result] = await pool.query(
      'INSERT INTO gps_positions (vehicle_id, latitude, longitude, speed, heading, altitude) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, latitude, longitude, speed, heading, altitude]
    );

    res.status(201).json({
      message: 'Position enregistrée',
      position: { id: result.insertId, vehicle_id: parseInt(req.params.id), latitude, longitude, speed, heading, altitude }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /vehicles/:id/positions - Get GPS history
app.get('/vehicles/:id/positions', authenticate, async (req, res) => {
  try {
    const { limit = 50, from, to } = req.query;
    let whereClause = 'WHERE vehicle_id = ?';
    const params = [req.params.id];

    if (from) { whereClause += ' AND recorded_at >= ?'; params.push(from); }
    if (to) { whereClause += ' AND recorded_at <= ?'; params.push(to); }

    const [positions] = await pool.query(
      `SELECT * FROM gps_positions ${whereClause} ORDER BY recorded_at DESC LIMIT ?`,
      [...params, parseInt(limit)]
    );

    res.json({ positions, vehicle_id: parseInt(req.params.id), total: positions.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /vehicles/:id/simulate - Simulate GPS movement
app.post('/vehicles/:id/simulate', authenticate, async (req, res) => {
  try {
    const [vehicles] = await pool.query('SELECT id FROM vehicles WHERE id = ? AND is_active = TRUE', [req.params.id]);
    if (vehicles.length === 0) return res.status(404).json({ error: 'Véhicule non trouvé' });

    // Simulate 5 random positions around Tunis
    const baseLat = 36.8065 + (Math.random() - 0.5) * 0.1;
    const baseLng = 10.1815 + (Math.random() - 0.5) * 0.1;
    const positions = [];

    for (let i = 0; i < 5; i++) {
      const lat = baseLat + (Math.random() - 0.5) * 0.01;
      const lng = baseLng + (Math.random() - 0.5) * 0.01;
      const speed = Math.random() * 80;
      const heading = Math.random() * 360;

      await pool.query(
        'INSERT INTO gps_positions (vehicle_id, latitude, longitude, speed, heading) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, lat, lng, speed, heading]
      );
      positions.push({ latitude: lat, longitude: lng, speed, heading });
    }

    res.json({ message: '5 positions simulées', positions });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'vehicles', status: 'OK', timestamp: new Date().toISOString() });
});

pool.getConnection()
  .then(conn => { console.log('✅ Vehicle Service: DB connected'); conn.release(); })
  .catch(err => { console.error('❌ Vehicle Service: DB failed:', err.message); process.exit(1); });

app.listen(PORT, () => console.log(`🚗 Vehicle Service running on port ${PORT}`));
