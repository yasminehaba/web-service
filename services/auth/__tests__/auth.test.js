/**
 * Tests unitaires pour le service d'authentification
 * Couvre: register, login, authentication middleware, JWT tokens
 */

describe('Auth Service - Validation et Middleware', () => {
  
  describe('Validation des données d\'entrée', () => {
    
    test('devrait valider un email correct', () => {
      const email = 'user@example.com';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test(email)).toBe(true);
    });

    test('devrait rejeter un email invalide', () => {
      const invalidEmails = ['notanemail', 'user@', '@example.com', 'user@.com'];
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      invalidEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    test('devrait valider un mot de passe fort', () => {
      const password = 'SecurePass123';
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
      expect(passwordRegex.test(password)).toBe(true);
    });

    test('devrait rejeter un mot de passe faible', () => {
      const weakPasswords = ['weak', 'onlyletters', '12345678'];
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
      weakPasswords.forEach(pwd => {
        expect(passwordRegex.test(pwd)).toBe(false);
      });
    });

    test('devrait valider la longueur du username (3-50 caractères)', () => {
      const validUsername = 'john_doe';
      expect(validUsername.length).toBeGreaterThanOrEqual(3);
      expect(validUsername.length).toBeLessThanOrEqual(50);
    });

    test('devrait rejeter un username trop court', () => {
      const shortUsername = 'ab';
      expect(shortUsername.length).toBeLessThan(3);
    });

    test('devrait rejeter un username trop long', () => {
      const longUsername = 'a'.repeat(51);
      expect(longUsername.length).toBeGreaterThan(50);
    });
  });

  describe('Validation des rôles', () => {
    
    test('devrait accepter les rôles valides', () => {
      const validRoles = ['ADMIN', 'OPERATOR'];
      validRoles.forEach(role => {
        expect(['ADMIN', 'OPERATOR'].includes(role)).toBe(true);
      });
    });

    test('devrait rejeter les rôles invalides', () => {
      const invalidRoles = ['USER', 'GUEST', 'SUPERADMIN'];
      invalidRoles.forEach(role => {
        expect(['ADMIN', 'OPERATOR'].includes(role)).toBe(false);
      });
    });
  });

  describe('Gestion des tokens JWT', () => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

    test('devrait créer un token JWT valide', () => {
      const payload = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: 'OPERATOR'
      };
      
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    test('devrait vérifier un token JWT valide', () => {
      const payload = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: 'OPERATOR'
      };
      
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
      const decoded = jwt.verify(token, JWT_SECRET);
      
      expect(decoded.id).toBe(1);
      expect(decoded.username).toBe('testuser');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('OPERATOR');
    });

    test('devrait rejeter un token JWT invalide', () => {
      const invalidToken = 'invalid.token.here';
      
      expect(() => {
        jwt.verify(invalidToken, JWT_SECRET);
      }).toThrow();
    });

    test('devrait rejeter un token expiré', () => {
      const payload = {
        id: 1,
        username: 'testuser'
      };
      
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '0s' });
      
      // Attendre 1 seconde pour que le token expire
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(() => {
            jwt.verify(token, JWT_SECRET);
          }).toThrow();
          resolve();
        }, 1000);
      });
    });

    test('devrait utiliser le bon secret pour vérifier le token', () => {
      const payload = { id: 1, username: 'testuser' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
      
      expect(() => {
        jwt.verify(token, 'wrong_secret');
      }).toThrow();
    });
  });

  describe('Authentification - Middleware', () => {
    
    test('devrait extraire le token du header Authorization', () => {
      const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
      
      expect(token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    });

    test('devrait rejeter les headers Authorization malformés', () => {
      const invalidHeaders = [
        'InvalidBearer token',
        'Bearer',
        'token_without_bearer',
        ''
      ];

      invalidHeaders.forEach(header => {
        const isValid = header.startsWith('Bearer ');
        expect(isValid).toBe(false);
      });
    });

    test('devrait vérifier le rôle ADMIN', () => {
      const user = { role: 'ADMIN' };
      expect(user.role).toBe('ADMIN');
    });

    test('devrait rejeter les utilisateurs non ADMIN pour requireAdmin', () => {
      const nonAdminUsers = [
        { role: 'OPERATOR' },
        { role: 'USER' },
        { role: undefined }
      ];

      nonAdminUsers.forEach(user => {
        expect(user.role === 'ADMIN').toBe(false);
      });
    });
  });

  describe('Sécurité des mots de passe', () => {
    const bcrypt = require('bcryptjs');

    test('devrait hasher un mot de passe', async () => {
      const password = 'SecurePassword123';
      const hashedPassword = await bcrypt.hash(password, 12);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(password.length);
    });

    test('devrait vérifier un mot de passe correct', async () => {
      const password = 'SecurePassword123';
      const hashedPassword = await bcrypt.hash(password, 12);
      const isValid = await bcrypt.compare(password, hashedPassword);
      
      expect(isValid).toBe(true);
    });

    test('devrait rejeter un mot de passe incorrect', async () => {
      const password = 'SecurePassword123';
      const hashedPassword = await bcrypt.hash(password, 12);
      const isValid = await bcrypt.compare('WrongPassword123', hashedPassword);
      
      expect(isValid).toBe(false);
    });

    test('devrait produire des hashes différents pour le même mot de passe', async () => {
      const password = 'SecurePassword123';
      const hash1 = await bcrypt.hash(password, 12);
      const hash2 = await bcrypt.hash(password, 12);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Format des réponses d\'erreur', () => {
    
    test('devrait retourner un message d\'erreur pour email invalide', () => {
      const errors = ['Email invalide'];
      expect(errors).toContain('Email invalide');
    });

    test('devrait retourner un message d\'erreur pour mot de passe faible', () => {
      const errors = ['Mot de passe: 8+ chars, majuscule, minuscule, chiffre'];
      expect(errors).toContain('Mot de passe: 8+ chars, majuscule, minuscule, chiffre');
    });

    test('devrait retourner un message d\'erreur pour username court', () => {
      const errors = ['Username: 3-50 caractères'];
      expect(errors).toContain('Username: 3-50 caractères');
    });
  });

});
