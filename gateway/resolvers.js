const axios = require('axios');
require('dotenv').config();

const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
const VEHICLE_URL = process.env.VEHICLE_SERVICE_URL || 'http://localhost:4002';
const TRAFFIC_URL = process.env.TRAFFIC_SERVICE_URL || 'http://localhost:4003';
const INCIDENT_URL = process.env.INCIDENT_SERVICE_URL || 'http://localhost:4004';
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4005';

// ─── HTTP Helper ─────────────────────────────────────────────
async function http(method, url, { data, token } = {}) {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios({ method, url, data, headers, timeout: 10000 });
    return response.data;
  } catch (err) {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message;
    const status = err.response?.status;
    throw new Error(`[${status || 'ERR'}] ${msg}`);
  }
}

const get = (url, token) => http('GET', url, { token });
const post = (url, data, token) => http('POST', url, { data, token });
const put = (url, data, token) => http('PUT', url, { data, token });
const patch = (url, data, token) => http('PATCH', url, { data, token });
const del = (url, token) => http('DELETE', url, { token });

// ─── Auth Check ──────────────────────────────────────────────
function requireAuth(context) {
  if (!context.token) throw new Error('Authentification requise. Veuillez fournir un token JWT.');
  return context.token;
}

// ─── Resolvers ───────────────────────────────────────────────
const resolvers = {
  Query: {
    // ── Health ─────────────────────────────────────────────
    health: async () => {
      const services = await Promise.allSettled([
        get(`${AUTH_URL}/health`),
        get(`${VEHICLE_URL}/health`),
        get(`${TRAFFIC_URL}/health`),
        get(`${INCIDENT_URL}/health`),
        get(`${NOTIFICATION_URL}/health`),
      ]);

      return {
        gateway: { service: 'gateway', status: 'OK', timestamp: new Date().toISOString() },
        services: services.map((s, i) => {
          const names = ['auth', 'vehicles', 'traffic', 'incidents', 'notifications'];
          return s.status === 'fulfilled'
            ? s.value
            : { service: names[i], status: 'DOWN', timestamp: new Date().toISOString() };
        }),
      };
    },

    // ── Auth ────────────────────────────────────────────────
    me: async (_, __, ctx) => {
      const token = requireAuth(ctx);
      const data = await get(`${AUTH_URL}/auth/me`, token);
      return data.user;
    },

    listUsers: async (_, __, ctx) => {
      const token = requireAuth(ctx);
      const data = await get(`${AUTH_URL}/auth/users`, token);
      return data.users;
    },

    // ── Vehicles ────────────────────────────────────────────
    vehicles: async (_, args, ctx) => {
      const token = requireAuth(ctx);
      const params = new URLSearchParams();
      if (args.type) params.append('type', args.type);
      if (args.is_active !== undefined) params.append('is_active', args.is_active);
      if (args.page) params.append('page', args.page);
      if (args.limit) params.append('limit', args.limit);
      const data = await get(`${VEHICLE_URL}/vehicles?${params}`, token);
      return data;
    },

    vehicle: async (_, { id }, ctx) => {
      const token = requireAuth(ctx);
      return await get(`${VEHICLE_URL}/vehicles/${id}`, token);
    },

    vehiclePositions: async (_, { id, limit, from, to }, ctx) => {
      const token = requireAuth(ctx);
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit);
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      return await get(`${VEHICLE_URL}/vehicles/${id}/positions?${params}`, token);
    },

    // ── Traffic ─────────────────────────────────────────────
    trafficZones: async (_, __, ctx) => {
      const token = requireAuth(ctx);
      const data = await get(`${TRAFFIC_URL}/traffic/zones`, token);
      return data.zones;
    },

    trafficZone: async (_, { id }, ctx) => {
      const token = requireAuth(ctx);
      return await get(`${TRAFFIC_URL}/traffic/zones/${id}`, token);
    },

    congestedZones: async (_, __, ctx) => {
      const token = requireAuth(ctx);
      return await get(`${TRAFFIC_URL}/traffic/congested`, token);
    },

    trafficStats: async (_, __, ctx) => {
      const token = requireAuth(ctx);
      const data = await get(`${TRAFFIC_URL}/traffic/stats`, token);
      return data.stats;
    },

    zoneMeasurements: async (_, { zoneId, limit }, ctx) => {
      const token = requireAuth(ctx);
      const params = limit ? `?limit=${limit}` : '';
      const data = await get(`${TRAFFIC_URL}/traffic/zones/${zoneId}/measurements${params}`, token);
      return data.measurements;
    },

    // ── Incidents ───────────────────────────────────────────
    incidents: async (_, args, ctx) => {
      const token = requireAuth(ctx);
      const params = new URLSearchParams();
      if (args.type) params.append('type', args.type);
      if (args.status) params.append('status', args.status);
      if (args.severity) params.append('severity', args.severity);
      if (args.zoneId) params.append('zone_id', args.zoneId);
      if (args.page) params.append('page', args.page);
      if (args.limit) params.append('limit', args.limit);
      return await get(`${INCIDENT_URL}/incidents?${params}`, token);
    },

    incident: async (_, { id }, ctx) => {
      const token = requireAuth(ctx);
      return await get(`${INCIDENT_URL}/incidents/${id}`, token);
    },

    incidentStats: async (_, __, ctx) => {
      const token = requireAuth(ctx);
      const data = await get(`${INCIDENT_URL}/incidents/stats/summary`, token);
      return data.stats;
    },

    // ── Notifications ────────────────────────────────────────
    notifications: async (_, args, ctx) => {
      const token = requireAuth(ctx);
      const params = new URLSearchParams();
      if (args.is_read !== undefined) params.append('is_read', args.is_read);
      if (args.type) params.append('type', args.type);
      if (args.page) params.append('page', args.page);
      if (args.limit) params.append('limit', args.limit);
      return await get(`${NOTIFICATION_URL}/notifications?${params}`, token);
    },

    notification: async (_, { id }, ctx) => {
      const token = requireAuth(ctx);
      const data = await get(`${NOTIFICATION_URL}/notifications/${id}`, token);
      return data.notification;
    },
  },

  Mutation: {
    // ── Auth ────────────────────────────────────────────────
    register: async (_, args) => {
      const data = await post(`${AUTH_URL}/auth/register`, args);
      return { token: data.token, user: data.user, message: data.message };
    },

    login: async (_, args) => {
      const data = await post(`${AUTH_URL}/auth/login`, args);
      return { token: data.token, user: data.user, message: data.message };
    },

    changeUserRole: async (_, { userId, role }, ctx) => {
      const token = requireAuth(ctx);
      const data = await put(`${AUTH_URL}/auth/users/${userId}/role`, { role }, token);
      return { message: data.message, success: true };
    },

    deactivateUser: async (_, { userId }, ctx) => {
      const token = requireAuth(ctx);
      const data = await del(`${AUTH_URL}/auth/users/${userId}`, token);
      return { message: data.message, success: true };
    },

    // ── Vehicles ────────────────────────────────────────────
    addVehicle: async (_, args, ctx) => {
      const token = requireAuth(ctx);
      const data = await post(`${VEHICLE_URL}/vehicles`, args, token);
      return data.vehicle;
    },

    updateVehicle: async (_, { id, ...args }, ctx) => {
      const token = requireAuth(ctx);
      const data = await put(`${VEHICLE_URL}/vehicles/${id}`, args, token);
      return data.vehicle;
    },

    deleteVehicle: async (_, { id }, ctx) => {
      const token = requireAuth(ctx);
      const data = await del(`${VEHICLE_URL}/vehicles/${id}`, token);
      return { message: data.message, success: true };
    },

    recordPosition: async (_, { vehicleId, ...posData }, ctx) => {
      const token = requireAuth(ctx);
      const data = await post(`${VEHICLE_URL}/vehicles/${vehicleId}/positions`, posData, token);
      return data.position;
    },

    simulateVehicleMovement: async (_, { vehicleId }, ctx) => {
      const token = requireAuth(ctx);
      const data = await post(`${VEHICLE_URL}/vehicles/${vehicleId}/simulate`, {}, token);
      return { message: data.message, positions: data.positions.map((p, i) => ({ id: i, vehicle_id: vehicleId, recorded_at: new Date().toISOString(), ...p })) };
    },

    // ── Traffic ─────────────────────────────────────────────
    createTrafficZone: async (_, args, ctx) => {
      const token = requireAuth(ctx);
      const data = await post(`${TRAFFIC_URL}/traffic/zones`, args, token);
      return data.zone;
    },

    updateTrafficZone: async (_, { id, ...args }, ctx) => {
      const token = requireAuth(ctx);
      const data = await put(`${TRAFFIC_URL}/traffic/zones/${id}`, args, token);
      return data.zone;
    },

    measureTraffic: async (_, { zoneId, ...args }, ctx) => {
      const token = requireAuth(ctx);
      const data = await post(`${TRAFFIC_URL}/traffic/zones/${zoneId}/measure`, args, token);
      return data.measurement;
    },

    simulateTraffic: async (_, { zoneId }, ctx) => {
      const token = requireAuth(ctx);
      const data = await post(`${TRAFFIC_URL}/traffic/zones/${zoneId}/simulate`, {}, token);
      return data.simulation;
    },

    // ── Incidents ───────────────────────────────────────────
    declareIncident: async (_, { zoneId, ...args }, ctx) => {
      const token = requireAuth(ctx);
      const payload = { ...args };
      if (zoneId) payload.zone_id = zoneId;
      const data = await post(`${INCIDENT_URL}/incidents`, payload, token);
      return data.incident;
    },

    updateIncidentStatus: async (_, { id, status, message }, ctx) => {
      const token = requireAuth(ctx);
      const data = await put(`${INCIDENT_URL}/incidents/${id}/status`, { status, message }, token);
      return data.incident;
    },

    updateIncident: async (_, { id, zoneId, assignedTo, ...args }, ctx) => {
      const token = requireAuth(ctx);
      const payload = { ...args };
      if (zoneId) payload.zone_id = zoneId;
      if (assignedTo) payload.assigned_to = assignedTo;
      const data = await put(`${INCIDENT_URL}/incidents/${id}`, payload, token);
      return data.incident;
    },

    // ── Notifications ────────────────────────────────────────
    sendNotification: async (_, { recipientId, recipientRole, referenceType, referenceId, ...args }, ctx) => {
      const token = requireAuth(ctx);
      const payload = { ...args };
      if (recipientId) payload.recipient_id = recipientId;
      if (recipientRole) payload.recipient_role = recipientRole;
      if (referenceType) payload.reference_type = referenceType;
      if (referenceId) payload.reference_id = referenceId;
      const data = await post(`${NOTIFICATION_URL}/notifications`, payload, token);
      return data.notification;
    },

    markNotificationRead: async (_, { id }, ctx) => {
      const token = requireAuth(ctx);
      const data = await patch(`${NOTIFICATION_URL}/notifications/${id}/read`, {}, token);
      return data.notification;
    },

    markAllNotificationsRead: async (_, __, ctx) => {
      const token = requireAuth(ctx);
      const data = await patch(`${NOTIFICATION_URL}/notifications/read-all/mark`, {}, token);
      return { message: data.message, success: true };
    },

    deleteNotification: async (_, { id }, ctx) => {
      const token = requireAuth(ctx);
      const data = await del(`${NOTIFICATION_URL}/notifications/${id}`, token);
      return { message: data.message, success: true };
    },
  },
};

module.exports = resolvers;
