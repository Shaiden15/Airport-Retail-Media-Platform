-- Live activity: promo codes, ad plays (impressions) and redemptions

CREATE TABLE promo_codes (
  code TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  screen_id TEXT NOT NULL REFERENCES screens (id),
  linked_flight_id TEXT,
  parent_code TEXT REFERENCES promo_codes (code),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT
) STRICT;

CREATE TABLE impressions (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  creative_id TEXT NOT NULL REFERENCES creatives (id),
  screen_id TEXT NOT NULL REFERENCES screens (id),
  played_at TEXT NOT NULL,
  estimated_viewers INTEGER NOT NULL CHECK (estimated_viewers >= 0)
) STRICT;

CREATE TABLE redemptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES promo_codes (code),
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  outlet_id TEXT REFERENCES outlets (id),
  redeemed_at TEXT NOT NULL,
  basket_value REAL NOT NULL CHECK (basket_value >= 0),
  dominant_segment TEXT
) STRICT;

CREATE INDEX idx_promo_campaign ON promo_codes (campaign_id);
CREATE INDEX idx_impressions_campaign_time ON impressions (campaign_id, played_at);
CREATE INDEX idx_impressions_screen_time ON impressions (screen_id, played_at);
CREATE INDEX idx_redemptions_campaign ON redemptions (campaign_id, redeemed_at);
