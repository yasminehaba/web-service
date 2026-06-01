const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const jwt = require('jsonwebtoken');
const typeDefs = require('./typeDefs');
const resolvers = require('./resolvers');
require('dotenv').config();

const PORT = process.env.GATEWAY_PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ─── Apollo Server ──────────────────────────────────────────
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    formatError: (formattedError, error) => {
      console.error('GraphQL Error:', formattedError.message);
      return {
        message: formattedError.message,
        code: formattedError.extensions?.code || 'INTERNAL_ERROR',
        path: formattedError.path,
      };
    },
    introspection: true,
  });

  await server.start();

  // ─── Context: Extract JWT ────────────────────────────────────
  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => {
        const authHeader = req.headers.authorization || '';
        let token = null;
        let user = null;

        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
          try {
            user = jwt.verify(token, JWT_SECRET);
          } catch (err) {
            // Token invalid — let resolvers handle auth errors
          }
        }

        return { token, user };
      },
    })
  );

  // ─── REST Health Endpoint ────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({
      gateway: 'OK',
      graphql: `http://localhost:${PORT}/graphql`,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Welcome ─────────────────────────────────────────────────
  app.get('/', (req, res) => {
    res.json({
      name: 'Urban Traffic Management Platform',
      version: '1.0.0',
      graphql: `http://localhost:${PORT}/graphql`,
      services: {
        auth: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
        vehicles: process.env.VEHICLE_SERVICE_URL || 'http://localhost:4002',
        traffic: process.env.TRAFFIC_SERVICE_URL || 'http://localhost:4003',
        incidents: process.env.INCIDENT_SERVICE_URL || 'http://localhost:4004',
        notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4005',
      },
    });
  });

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚦 Urban Traffic Platform - API Gateway              ║
╠══════════════════════════════════════════════════════════╣
║  GraphQL:  http://localhost:${PORT}/graphql              ║
║  Health:   http://localhost:${PORT}/health               ║
╠══════════════════════════════════════════════════════════╣
║  Services:                                               ║
║    🔐 Auth:          http://localhost:4001               ║
║    🚗 Vehicles:      http://localhost:4002               ║
║    🚦 Traffic:       http://localhost:4003               ║
║    ⚠️  Incidents:     http://localhost:4004               ║
║    🔔 Notifications: http://localhost:4005               ║
╚══════════════════════════════════════════════════════════╝
    `);
  });
}

startServer().catch(console.error);
