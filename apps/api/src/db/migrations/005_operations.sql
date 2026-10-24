-- Operations: incidents, campaign reviews, airline goodwill rules and uploaded creative images

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('screen-offline', 'feed-lag', 'creative-failed', 'manual')),
  subject_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  owner TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  notes TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE campaign_reviews (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  checklist TEXT NOT NULL CHECK (json_valid(checklist)),
  notes TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
) STRICT;

CREATE TABLE goodwill_rules (
  id TEXT PRIMARY KEY,
  airline_code TEXT NOT NULL REFERENCES airlines (code),
  partner_advertiser_id TEXT NOT NULL REFERENCES advertisers (id),
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  threshold_minutes INTEGER NOT NULL CHECK (threshold_minutes BETWEEN 15 AND 600),
  airline_share_pct INTEGER NOT NULL CHECK (airline_share_pct BETWEEN 0 AND 100),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL REFERENCES advertisers (id),
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes BLOB NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 700000),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_incidents_status ON incidents (status, opened_at);
CREATE INDEX idx_reviews_campaign ON campaign_reviews (campaign_id);
CREATE INDEX idx_goodwill_airline ON goodwill_rules (airline_code);
