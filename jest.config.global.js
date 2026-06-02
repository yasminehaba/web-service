/**
 * Configuration globale pour tous les tests Jest
 */

// Variables d'environnement par défaut pour les tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_testing_only';
process.env.JWT_EXPIRES_IN = '1h';

// Configuration des ports pour les services
process.env.GATEWAY_PORT = '4000';
process.env.AUTH_SERVICE_PORT = '4001';
process.env.VEHICLE_SERVICE_PORT = '4002';
process.env.TRAFFIC_SERVICE_PORT = '4003';
process.env.INCIDENT_SERVICE_PORT = '4004';
process.env.NOTIFICATION_SERVICE_PORT = '4005';

// Configuration de la base de données
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'urban_traffic_test';

// URLs des services
process.env.AUTH_SERVICE_URL = 'http://localhost:4001';
process.env.VEHICLE_SERVICE_URL = 'http://localhost:4002';
process.env.TRAFFIC_SERVICE_URL = 'http://localhost:4003';
process.env.INCIDENT_SERVICE_URL = 'http://localhost:4004';
process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:4005';

// Paramètres de test
process.env.TEST_TIMEOUT = '10000';

module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  verbose: true,
  bail: false,
  forceExit: true
};
