-- ============================================================
-- Urban Traffic Management Platform - Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS urban_traffic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE urban_traffic;

-- ============================================================
-- AUTH SERVICE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'OPERATOR') NOT NULL DEFAULT 'OPERATOR',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- VEHICLE SERVICE
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  license_plate VARCHAR(20) NOT NULL UNIQUE,
  type ENUM('CAR', 'TRUCK', 'BUS', 'MOTORCYCLE', 'EMERGENCY') NOT NULL DEFAULT 'CAR',
  brand VARCHAR(50),
  model VARCHAR(50),
  color VARCHAR(30),
  owner_name VARCHAR(100),
  owner_contact VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gps_positions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  speed DECIMAL(5, 2) DEFAULT 0,
  heading DECIMAL(5, 2) DEFAULT 0,
  altitude DECIMAL(8, 2) DEFAULT 0,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  INDEX idx_vehicle_recorded (vehicle_id, recorded_at)
);

-- ============================================================
-- TRAFFIC SERVICE
-- ============================================================
CREATE TABLE IF NOT EXISTS traffic_zones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  zone_type ENUM('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'HIGHWAY', 'INTERSECTION') DEFAULT 'RESIDENTIAL',
  center_lat DECIMAL(10, 8) NOT NULL,
  center_lng DECIMAL(11, 8) NOT NULL,
  radius_meters INT DEFAULT 500,
  max_capacity INT DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS traffic_measurements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  zone_id INT NOT NULL,
  vehicle_count INT DEFAULT 0,
  average_speed DECIMAL(5, 2) DEFAULT 0,
  density_level ENUM('LOW', 'MEDIUM', 'HIGH') DEFAULT 'LOW',
  congestion_score DECIMAL(4, 2) DEFAULT 0,
  is_congested BOOLEAN DEFAULT FALSE,
  measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (zone_id) REFERENCES traffic_zones(id) ON DELETE CASCADE,
  INDEX idx_zone_measured (zone_id, measured_at)
);

-- ============================================================
-- INCIDENT SERVICE
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  type ENUM('ACCIDENT', 'CONSTRUCTION', 'ROAD_CLOSED', 'TRAFFIC_JAM') NOT NULL,
  status ENUM('REPORTED', 'IN_PROGRESS', 'RESOLVED') DEFAULT 'REPORTED',
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  zone_id INT,
  affected_vehicles TEXT,
  reported_by INT,
  assigned_to INT,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (zone_id) REFERENCES traffic_zones(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS incident_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  incident_id INT NOT NULL,
  message TEXT NOT NULL,
  old_status ENUM('REPORTED', 'IN_PROGRESS', 'RESOLVED'),
  new_status ENUM('REPORTED', 'IN_PROGRESS', 'RESOLVED'),
  updated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

-- ============================================================
-- NOTIFICATION SERVICE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('INCIDENT', 'TRAFFIC', 'SYSTEM', 'ALERT') DEFAULT 'SYSTEM',
  priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') DEFAULT 'NORMAL',
  recipient_id INT,
  recipient_role ENUM('ADMIN', 'OPERATOR', 'ALL'),
  reference_type VARCHAR(50),
  reference_id INT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  sent_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SEED DATA
-- ============================================================
-- Default admin user (password: Admin@123)
INSERT INTO users (username, email, password, role) VALUES
('admin', 'admin@urbantraffic.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniCl6RfJSvlEBz2YJJqBoBKEe', 'ADMIN'),
('operator1', 'operator1@urbantraffic.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniCl6RfJSvlEBz2YJJqBoBKEe', 'OPERATOR');

-- Sample traffic zones (Tunis city)
INSERT INTO traffic_zones (name, description, zone_type, center_lat, center_lng, radius_meters, max_capacity, created_by) VALUES
('Avenue Habib Bourguiba', 'Centre-ville principal de Tunis', 'COMMERCIAL', 36.8065, 10.1815, 800, 200, 1),
('Carrefour de la Manouba', 'Intersection principale Manouba', 'INTERSECTION', 36.8100, 10.1000, 300, 80, 1),
('Autoroute A1 - Lac', 'Voie rapide Lac de Tunis', 'HIGHWAY', 36.8300, 10.2200, 1000, 500, 1),
('Zone Industrielle Ben Arous', 'Zone industrielle Ben Arous', 'INDUSTRIAL', 36.7500, 10.2300, 600, 150, 1),
('Quartier Résidentiel Menzah', 'Zone résidentielle El Menzah', 'RESIDENTIAL', 36.8700, 10.1600, 700, 120, 1);

-- Sample vehicles
INSERT INTO vehicles (license_plate, type, brand, model, color, owner_name, owner_contact, created_by) VALUES
('TU-1234-AB', 'CAR', 'Volkswagen', 'Golf', 'Blanc', 'Mohamed Ben Ali', '+216 71 000 001', 1),
('TU-5678-CD', 'BUS', 'Mercedes', 'Citaro', 'Jaune', 'TRANSTU', '+216 71 000 002', 1),
('TU-9012-EF', 'TRUCK', 'Volvo', 'FH', 'Rouge', 'Logistique Express', '+216 71 000 003', 1),
('TU-3456-GH', 'EMERGENCY', 'Ford', 'Transit', 'Blanc/Rouge', 'SAMU Tunis', '+216 71 000 004', 1),
('TU-7890-IJ', 'MOTORCYCLE', 'Honda', 'CB500', 'Noir', 'Karim Mansour', '+216 71 000 005', 1);
