-- Master data: airlines, vendors, locations, advertisers, outlets and screens

CREATE TABLE airlines (
  code TEXT PRIMARY KEY,
  icao_code TEXT NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL CHECK (model IN ('full-service', 'low-cost')),
  hub_region TEXT NOT NULL,
  brand_color TEXT NOT NULL
) STRICT;

CREATE TABLE vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('screen-hardware', 'network', 'content-agency')),
  contact_email TEXT NOT NULL
) STRICT;

CREATE TABLE terminals (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
) STRICT;

CREATE TABLE concourses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  terminal_id TEXT NOT NULL REFERENCES terminals (id)
) STRICT;

CREATE TABLE zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  terminal_id TEXT NOT NULL REFERENCES terminals (id),
  concourse_id TEXT REFERENCES concourses (id),
  kind TEXT NOT NULL CHECK (kind IN ('gate-area', 'retail', 'security', 'landside')),
  airside INTEGER NOT NULL CHECK (airside IN (0, 1)),
  centroid_x REAL NOT NULL,
  centroid_y REAL NOT NULL,
  radius REAL NOT NULL
) STRICT;

CREATE TABLE gates (
  id TEXT PRIMARY KEY,
  terminal_id TEXT NOT NULL REFERENCES terminals (id),
  concourse_id TEXT NOT NULL REFERENCES concourses (id),
  zone_id TEXT NOT NULL REFERENCES zones (id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  bus INTEGER NOT NULL CHECK (bus IN (0, 1))
) STRICT;

CREATE TABLE advertisers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('retailer', 'fnb', 'airline', 'brand', 'lounge')),
  category TEXT NOT NULL,
  airline_code TEXT REFERENCES airlines (code),
  brand_color TEXT NOT NULL
) STRICT;

CREATE TABLE outlets (
  id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL REFERENCES advertisers (id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  terminal_id TEXT NOT NULL REFERENCES terminals (id),
  zone_id TEXT NOT NULL REFERENCES zones (id),
  nearest_gates TEXT NOT NULL CHECK (json_valid(nearest_gates)),
  avg_basket REAL NOT NULL CHECK (avg_basket > 0),
  in_stock INTEGER NOT NULL DEFAULT 1 CHECK (in_stock IN (0, 1))
) STRICT;

CREATE TABLE screens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  terminal_id TEXT NOT NULL REFERENCES terminals (id),
  zone_id TEXT NOT NULL REFERENCES zones (id),
  size_inches INTEGER NOT NULL CHECK (size_inches > 0),
  orientation TEXT NOT NULL CHECK (orientation IN ('portrait', 'landscape')),
  resolution TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  nearest_gates TEXT NOT NULL CHECK (json_valid(nearest_gates)),
  vendor_id TEXT NOT NULL REFERENCES vendors (id),
  status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline')),
  premium INTEGER NOT NULL CHECK (premium IN (0, 1))
) STRICT;

CREATE INDEX idx_screens_zone ON screens (zone_id);
CREATE INDEX idx_outlets_advertiser ON outlets (advertiser_id);
CREATE INDEX idx_gates_zone ON gates (zone_id);
