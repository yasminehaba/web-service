const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool, testConnection } = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.AUTH_SERVICE_PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

// ─── Middleware: Auth ────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant ou invalide' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expiré ou invalide' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
};

// ─── Validation Rules ────────────────────────────────────────
const registerValidation = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username: 3-50 caractères'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Mot de passe: 8+ chars, majuscule, minuscule, chiffre'),
  body('role').optional().isIn(['ADMIN', 'OPERATOR']).withMessage('Rôle invalide'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
];

// ─── Routes ─────────────────────────────────────────────────

// POST /auth/register
app.post('/auth/register', registerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, email, password, role = 'OPERATOR' } = req.body;

  try {
    // Check uniqueness
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email ou username déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role]
    );

    const token = jwt.sign(
      { id: result.insertId, username, email, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      token,
      user: { id: result.insertId, username, email, role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription' });
  }
});

// POST /auth/login
app.post('/auth/login', loginValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

// GET /auth/me - Get current user
app.get('/auth/me', authenticate, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, role, is_active, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json({ user: users[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /auth/verify - Verify token (used by Gateway)
app.get('/auth/verify', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// GET /auth/users - List all users (ADMIN only)
app.get('/auth/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users, total: users.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /auth/users/:id/role - Change role (ADMIN only)
app.put('/auth/users/:id/role',
  authenticate,
  requireAdmin,
  [body('role').isIn(['ADMIN', 'OPERATOR']).withMessage('Rôle invalide')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { role } = req.body;
    try {
      const [result] = await pool.query(
        'UPDATE users SET role = ? WHERE id = ?',
        [role, req.params.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
      res.json({ message: 'Rôle mis à jour avec succès' });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// DELETE /auth/users/:id - Deactivate user (ADMIN only)
app.delete('/auth/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ message: 'Utilisateur désactivé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'auth', status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
testConnection().then(() => {
  app.listen(PORT, () => {
    console.log(`🔐 Auth Service running on port ${PORT}`);
  });
});
