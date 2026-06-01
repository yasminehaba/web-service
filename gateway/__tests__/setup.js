// Tests de configuration communes pour le Gateway
beforeAll(() => {
  process.env.JWT_SECRET = 'test_secret';
  process.env.GATEWAY_PORT = 4000;
  process.env.AUTH_SERVICE_URL = 'http://localhost:4001';
  process.env.VEHICLE_SERVICE_URL = 'http://localhost:4002';
  process.env.TRAFFIC_SERVICE_URL = 'http://localhost:4003';
  process.env.INCIDENT_SERVICE_URL = 'http://localhost:4004';
  process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:4005';
});

afterAll(() => {
  jest.clearAllMocks();
});
