const { gql } = require('graphql-tag');

const typeDefs = gql`
  # ─── Scalars ───────────────────────────────────────────────
  scalar DateTime

  # ─── Enums ─────────────────────────────────────────────────
  enum Role {
    ADMIN
    OPERATOR
  }

  enum VehicleType {
    CAR
    TRUCK
    BUS
    MOTORCYCLE
    EMERGENCY
  }

  enum ZoneType {
    RESIDENTIAL
    COMMERCIAL
    INDUSTRIAL
    HIGHWAY
    INTERSECTION
  }

  enum DensityLevel {
    LOW
    MEDIUM
    HIGH
  }

  enum IncidentType {
    ACCIDENT
    CONSTRUCTION
    ROAD_CLOSED
    TRAFFIC_JAM
  }

  enum IncidentStatus {
    REPORTED
    IN_PROGRESS
    RESOLVED
  }

  enum IncidentSeverity {
    LOW
    MEDIUM
    HIGH
    CRITICAL
  }

  enum NotificationType {
    INCIDENT
    TRAFFIC
    SYSTEM
    ALERT
  }

  enum NotificationPriority {
    LOW
    NORMAL
    HIGH
    URGENT
  }

  enum RecipientRole {
    ADMIN
    OPERATOR
    ALL
  }

  # ─── Types ─────────────────────────────────────────────────

  type User {
    id: ID!
    username: String!
    email: String!
    role: Role!
    is_active: Boolean!
    created_at: String
  }

  type AuthPayload {
    token: String!
    user: User!
    message: String!
  }

  type Vehicle {
    id: ID!
    license_plate: String!
    type: VehicleType!
    brand: String
    model: String
    color: String
    owner_name: String
    owner_contact: String
    is_active: Boolean!
    position_count: Int
    last_seen: String
    created_at: String
    updated_at: String
  }

  type GpsPosition {
    id: ID!
    vehicle_id: ID!
    latitude: Float!
    longitude: Float!
    speed: Float
    heading: Float
    altitude: Float
    recorded_at: String!
  }

  type VehicleWithPosition {
    vehicle: Vehicle!
    last_position: GpsPosition
  }

  type VehiclePositions {
    positions: [GpsPosition!]!
    vehicle_id: ID!
    total: Int!
  }

  type SimulationResult {
    message: String!
    positions: [GpsPosition!]!
  }

  type TrafficZone {
    id: ID!
    name: String!
    description: String
    zone_type: ZoneType!
    center_lat: Float!
    center_lng: Float!
    radius_meters: Int!
    max_capacity: Int!
    is_active: Boolean!
    current_density: DensityLevel
    is_congested: Boolean
    current_vehicles: Int
    created_at: String
    updated_at: String
  }

  type TrafficMeasurement {
    id: ID!
    zone_id: ID!
    zone_name: String
    vehicle_count: Int!
    average_speed: Float!
    density_level: DensityLevel!
    congestion_score: Float!
    is_congested: Boolean!
    measured_at: String!
  }

  type TrafficStats {
    total_zones: Int!
    low_density_zones: Int
    medium_density_zones: Int
    high_density_zones: Int
    congested_zones: Int
    avg_speed: Float
    total_vehicles: Int
    timestamp: String
  }

  type Incident {
    id: ID!
    title: String!
    description: String
    type: IncidentType!
    status: IncidentStatus!
    severity: IncidentSeverity!
    latitude: Float
    longitude: Float
    zone_id: ID
    zone_name: String
    reported_by: ID
    assigned_to: ID
    resolved_at: String
    created_at: String!
    updated_at: String
  }

  type IncidentUpdate {
    id: ID!
    incident_id: ID!
    message: String!
    old_status: IncidentStatus
    new_status: IncidentStatus
    updated_by: ID
    created_at: String!
  }

  type IncidentWithHistory {
    incident: Incident!
    history: [IncidentUpdate!]!
  }

  type IncidentStats {
    total: Int!
    reported: Int!
    in_progress: Int!
    resolved: Int!
    accidents: Int!
    constructions: Int!
    road_closures: Int!
    traffic_jams: Int!
    critical: Int!
  }

  type Notification {
    id: ID!
    title: String!
    message: String!
    type: NotificationType!
    priority: NotificationPriority!
    recipient_id: ID
    recipient_role: RecipientRole
    reference_type: String
    reference_id: ID
    is_read: Boolean!
    read_at: String
    sent_by: ID
    created_at: String!
  }

  type NotificationList {
    notifications: [Notification!]!
    total: Int!
    unread: Int!
    page: Int!
    limit: Int!
  }

  # ─── Pagination ─────────────────────────────────────────────
  type VehicleList {
    vehicles: [Vehicle!]!
    total: Int!
    page: Int!
    limit: Int!
  }

  type IncidentList {
    incidents: [Incident!]!
    total: Int!
    page: Int!
    limit: Int!
  }

  type TrafficZoneWithMeasurements {
    zone: TrafficZone!
    recent_measurements: [TrafficMeasurement!]!
  }

  type CongestedZoneResult {
    congested_zones: [TrafficMeasurement!]!
    total: Int!
  }

  type ServiceHealth {
    service: String!
    status: String!
    timestamp: String!
  }

  type PlatformHealth {
    gateway: ServiceHealth!
    services: [ServiceHealth!]!
  }

  type SuccessMessage {
    message: String!
    success: Boolean!
  }

  # ─── Queries ────────────────────────────────────────────────
  type Query {
    # Health
    health: PlatformHealth!

    # Auth
    me: User!
    listUsers: [User!]!

    # Vehicles
    vehicles(type: VehicleType, is_active: Boolean, page: Int, limit: Int): VehicleList!
    vehicle(id: ID!): VehicleWithPosition!
    vehiclePositions(id: ID!, limit: Int, from: String, to: String): VehiclePositions!

    # Traffic
    trafficZones: [TrafficZone!]!
    trafficZone(id: ID!): TrafficZoneWithMeasurements!
    congestedZones: CongestedZoneResult!
    trafficStats: TrafficStats!
    zoneMeasurements(zoneId: ID!, limit: Int): [TrafficMeasurement!]!

    # Incidents
    incidents(type: IncidentType, status: IncidentStatus, severity: IncidentSeverity, zoneId: ID, page: Int, limit: Int): IncidentList!
    incident(id: ID!): IncidentWithHistory!
    incidentStats: IncidentStats!

    # Notifications
    notifications(is_read: Boolean, type: NotificationType, page: Int, limit: Int): NotificationList!
    notification(id: ID!): Notification!
  }

  # ─── Mutations ──────────────────────────────────────────────
  type Mutation {
    # Auth
    register(username: String!, email: String!, password: String!, role: Role): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    changeUserRole(userId: ID!, role: Role!): SuccessMessage!
    deactivateUser(userId: ID!): SuccessMessage!

    # Vehicles
    addVehicle(
      license_plate: String!
      type: VehicleType!
      brand: String
      model: String
      color: String
      owner_name: String
      owner_contact: String
    ): Vehicle!

    updateVehicle(
      id: ID!
      license_plate: String!
      type: VehicleType!
      brand: String
      model: String
      color: String
      owner_name: String
      owner_contact: String
      is_active: Boolean
    ): Vehicle!

    deleteVehicle(id: ID!): SuccessMessage!

    recordPosition(
      vehicleId: ID!
      latitude: Float!
      longitude: Float!
      speed: Float
      heading: Float
      altitude: Float
    ): GpsPosition!

    simulateVehicleMovement(vehicleId: ID!): SimulationResult!

    # Traffic
    createTrafficZone(
      name: String!
      description: String
      zone_type: ZoneType
      center_lat: Float!
      center_lng: Float!
      radius_meters: Int
      max_capacity: Int
    ): TrafficZone!

    updateTrafficZone(
      id: ID!
      name: String!
      description: String
      zone_type: ZoneType
      center_lat: Float!
      center_lng: Float!
      radius_meters: Int
      max_capacity: Int
      is_active: Boolean
    ): TrafficZone!

    measureTraffic(
      zoneId: ID!
      vehicle_count: Int!
      average_speed: Float
    ): TrafficMeasurement!

    simulateTraffic(zoneId: ID!): TrafficMeasurement!

    # Incidents
    declareIncident(
      title: String!
      description: String
      type: IncidentType!
      severity: IncidentSeverity
      latitude: Float
      longitude: Float
      zoneId: ID
    ): Incident!

    updateIncidentStatus(
      id: ID!
      status: IncidentStatus!
      message: String
    ): Incident!

    updateIncident(
      id: ID!
      title: String!
      description: String
      type: IncidentType!
      severity: IncidentSeverity
      latitude: Float
      longitude: Float
      zoneId: ID
      assignedTo: ID
    ): Incident!

    # Notifications
    sendNotification(
      title: String!
      message: String!
      type: NotificationType
      priority: NotificationPriority
      recipientId: ID
      recipientRole: RecipientRole
      referenceType: String
      referenceId: ID
    ): Notification!

    markNotificationRead(id: ID!): Notification!
    markAllNotificationsRead: SuccessMessage!
    deleteNotification(id: ID!): SuccessMessage!
  }
`;

module.exports = typeDefs;
