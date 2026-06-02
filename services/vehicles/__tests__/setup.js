// Tests de configuration communes pour le service véhicules
beforeAll(() => {
  process.env.JWT_SECRET = 'test_secret';
  process.env.DB_HOST = 'localhost';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = 'urban_traffic_test';
});

afterAll(() => {
  jest.clearAllMocks();
});
