const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.TRAFFIC_SERVICE_PORT || 4003;
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

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Accès ADMIN requis' });
  next();
};

// ─── Helper: Density Calculation ────────────────────────────
function calculateDensityLevel(vehicleCount, maxCapacity) {
  const ratio = vehicleCount / maxCapacity;
  if (ratio < 0.4) return 'LOW';
  if (ratio < 0.75) return 'MEDIUM';
  return 'HIGH';
}

function calculateCongestionScore(vehicleCount, maxCapacity, avgSpeed) {
  const densityScore = Math.min((vehicleCount / maxCapacity) * 60, 60);
  const speedPenalty = avgSpeed < 20 ? 40 : avgSpeed < 40 ? 20 : 0;
  return Math.min(densityScore + speedPenalty, 100).toFixed(2);
}

// ─── Routes: Zones ───────────────────────────────────────────

const zoneValidation = [
  body('name').trim().notEmpty().withMessage('Nom requis'),
  body('center_lat').isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide'),
  body('center_lng').isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide'),
  body('zone_type').optional().isIn(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'HIGHWAY', 'INTERSECTION']),
  body('radius_meters').optional().isInt({ min: 50, max: 10000 }),
  body('max_capacity').optional().isInt({ min: 1 }),
];

// POST /traffic/zones
app.post('/traffic/zones', authenticate, requireAdmin, zoneValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description, zone_type = 'RESIDENTIAL', center_lat, center_lng,
          radius_meters = 500, max_capacity = 100 } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO traffic_zones (name, description, zone_type, center_lat, center_lng, radius_meters, max_capacity, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, zone_type, center_lat, center_lng, radius_meters, max_capacity, req.user.id]
    );
    const [zone] = await pool.query('SELECT * FROM traffic_zones WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Zone créée', zone: zone[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /traffic/zones
app.get('/traffic/zones', authenticate, async (req, res) => {
  try {
    const [zones] = await pool.query(`
      SELECT z.*,
        (SELECT density_level FROM traffic_measurements WHERE zone_id = z.id ORDER BY measured_at DESC LIMIT 1) as current_density,
        (SELECT is_congested FROM traffic_measurements WHERE zone_id = z.id ORDER BY measured_at DESC LIMIT 1) as is_congested,
        (SELECT vehicle_count FROM traffic_measurements WHERE zone_id = z.id ORDER BY measured_at DESC LIMIT 1) as current_vehicles
      FROM traffic_zones z WHERE z.is_active = TRUE ORDER BY z.name
    `);
    res.json({ zones, total: zones.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /traffic/zones/:id
app.get('/traffic/zones/:id', authenticate, async (req, res) => {
  try {
    const [zones] = await pool.query('SELECT * FROM traffic_zones WHERE id = ?', [req.params.id]);
    if (zones.length === 0) return res.status(404).json({ error: 'Zone non trouvée' });

    const [measurements] = await pool.query(
      'SELECT * FROM traffic_measurements WHERE zone_id = ? ORDER BY measured_at DESC LIMIT 10',
      [req.params.id]
    );

    res.json({ zone: zones[0], recent_measurements: measurements });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /traffic/zones/:id
app.put('/traffic/zones/:id', authenticate, requireAdmin, zoneValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description, zone_type, center_lat, center_lng, radius_meters, max_capacity, is_active } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE traffic_zones SET name=?, description=?, zone_type=?, center_lat=?, center_lng=?,
       radius_meters=?, max_capacity=?, is_active=? WHERE id=?`,
      [name, description, zone_type, center_lat, center_lng, radius_meters, max_capacity,
       is_active !== undefined ? is_active : true, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Zone non trouvée' });
    const [updated] = await pool.query('SELECT * FROM traffic_zones WHERE id = ?', [req.params.id]);
    res.json({ message: 'Zone mise à jour', zone: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Routes: Measurements ────────────────────────────────────

// POST /traffic/zones/:id/measure - Record traffic measurement
app.post('/traffic/zones/:id/measure', authenticate,
  [
    body('vehicle_count').isInt({ min: 0 }).withMessage('Nombre de véhicules invalide'),
    body('average_speed').optional().isFloat({ min: 0 }).withMessage('Vitesse invalide'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { vehicle_count, average_speed = 0 } = req.body;

    try {
      const [zones] = await pool.query('SELECT * FROM traffic_zones WHERE id = ? AND is_active = TRUE', [req.params.id]);
      if (zones.length === 0) return res.status(404).json({ error: 'Zone non trouvée' });

      const zone = zones[0];
      const density_level = calculateDensityLevel(vehicle_count, zone.max_capacity);
      const congestion_score = calculateCongestionScore(vehicle_count, zone.max_capacity, average_speed);
      const is_congested = density_level === 'HIGH' || parseFloat(congestion_score) >= 70;

      const [result] = await pool.query(
        `INSERT INTO traffic_measurements (zone_id, vehicle_count, average_speed, density_level, congestion_score, is_congested)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [zone.id, vehicle_count, average_speed, density_level, congestion_score, is_congested]
      );

      res.status(201).json({
        message: 'Mesure enregistrée',
        measurement: {
          id: result.insertId,
          zone_id: zone.id,
          zone_name: zone.name,
          vehicle_count,
          average_speed,
          density_level,
          congestion_score: parseFloat(congestion_score),
          is_congested,
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// GET /traffic/congested - Get congested zones
app.get('/traffic/congested', authenticate, async (req, res) => {
  try {
    const [zones] = await pool.query(`
      SELECT z.*, m.vehicle_count, m.average_speed, m.density_level, m.congestion_score, m.measured_at
      FROM traffic_zones z
      INNER JOIN traffic_measurements m ON m.zone_id = z.id
      WHERE m.is_congested = TRUE AND z.is_active = TRUE
        AND m.measured_at = (
          SELECT MAX(measured_at) FROM traffic_measurements WHERE zone_id = z.id
        )
      ORDER BY m.congestion_score DESC
    `);
    res.json({ congested_zones: zones, total: zones.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /traffic/stats - Global traffic stats
app.get('/traffic/stats', authenticate, async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(DISTINCT z.id) as total_zones,
        SUM(CASE WHEN latest.density_level = 'LOW' THEN 1 ELSE 0 END) as low_density_zones,
        SUM(CASE WHEN latest.density_level = 'MEDIUM' THEN 1 ELSE 0 END) as medium_density_zones,
        SUM(CASE WHEN latest.density_level = 'HIGH' THEN 1 ELSE 0 END) as high_density_zones,
        SUM(CASE WHEN latest.is_congested = 1 THEN 1 ELSE 0 END) as congested_zones,
        AVG(latest.average_speed) as avg_speed,
        SUM(latest.vehicle_count) as total_vehicles
      FROM traffic_zones z
      LEFT JOIN (
        SELECT m.* FROM traffic_measurements m
        INNER JOIN (
          SELECT zone_id, MAX(measured_at) as max_date FROM traffic_measurements GROUP BY zone_id
        ) latest_dates ON m.zone_id = latest_dates.zone_id AND m.measured_at = latest_dates.max_date
      ) latest ON latest.zone_id = z.id
      WHERE z.is_active = TRUE
    `);
    res.json({ stats: stats[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /traffic/zones/:id/measurements
app.get('/traffic/zones/:id/measurements', authenticate, async (req, res) => {
  try {
    const { limit = 24 } = req.query;
    const [measurements] = await pool.query(
      'SELECT * FROM traffic_measurements WHERE zone_id = ? ORDER BY measured_at DESC LIMIT ?',
      [req.params.id, parseInt(limit)]
    );
    res.json({ measurements, zone_id: parseInt(req.params.id), total: measurements.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /traffic/zones/:id/simulate - Simulate traffic
app.post('/traffic/zones/:id/simulate', authenticate, async (req, res) => {
  try {
    const [zones] = await pool.query('SELECT * FROM traffic_zones WHERE id = ? AND is_active = TRUE', [req.params.id]);
    if (zones.length === 0) return res.status(404).json({ error: 'Zone non trouvée' });

    const zone = zones[0];
    const vehicle_count = Math.floor(Math.random() * zone.max_capacity * 1.2);
    const average_speed = Math.max(5, 80 - (vehicle_count / zone.max_capacity) * 70 + (Math.random() - 0.5) * 10);
    const density_level = calculateDensityLevel(vehicle_count, zone.max_capacity);
    const congestion_score = calculateCongestionScore(vehicle_count, zone.max_capacity, average_speed);
    const is_congested = density_level === 'HIGH';

    await pool.query(
      `INSERT INTO traffic_measurements (zone_id, vehicle_count, average_speed, density_level, congestion_score, is_congested)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [zone.id, vehicle_count, average_speed.toFixed(1), density_level, congestion_score, is_congested]
    );

    res.json({
      message: 'Données simulées',
      simulation: { zone_name: zone.name, vehicle_count, average_speed: parseFloat(average_speed.toFixed(1)), density_level, congestion_score: parseFloat(congestion_score), is_congested }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/health', (req, res) => res.json({ service: 'traffic', status: 'OK', timestamp: new Date().toISOString() }));

pool.getConnection()
  .then(conn => { console.log('✅ Traffic Service: DB connected'); conn.release(); })
  .catch(err => { console.error('❌ Traffic Service: DB failed:', err.message); process.exit(1); });

app.listen(PORT, () => console.log(`🚦 Traffic Service running on port ${PORT}`));
module.exports = {
  app,
  calculateCongestionLevel,
  calculateAverageSpeed,
  predictTraffic,
  detectAnomaly,
  generateTrafficReport
};