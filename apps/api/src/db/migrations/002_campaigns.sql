-- Campaigns, creatives and their 30-day performance history

CREATE TABLE creatives (
  id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL REFERENCES advertisers (id),
  name TEXT NOT NULL,
  template TEXT NOT NULL CHECK (template IN ('hero-offer', 'countdown-deal', 'destination', 'upgrade', 'goodwill')),
  content TEXT NOT NULL CHECK (json_valid(content)),
  translations TEXT NOT NULL CHECK (json_valid(translations)),
  approval TEXT NOT NULL CHECK (approval IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL REFERENCES advertisers (id),
  outlet_id TEXT REFERENCES outlets (id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending-approval', 'approved', 'rejected', 'active', 'paused', 'completed')),
  creative_ids TEXT NOT NULL CHECK (json_valid(creative_ids)),
  targeting TEXT NOT NULL CHECK (json_valid(targeting)),
  schedule TEXT NOT NULL CHECK (json_valid(schedule)),
  budget TEXT NOT NULL CHECK (json_valid(budget)),
  offer TEXT NOT NULL CHECK (json_valid(offer)),
  brand_safety TEXT NOT NULL CHECK (json_valid(brand_safety)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE campaign_daily_stats (
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  date TEXT NOT NULL,
  plays INTEGER NOT NULL CHECK (plays >= 0),
  impressions INTEGER NOT NULL CHECK (impressions >= 0),
  scans INTEGER NOT NULL CHECK (scans >= 0),
  redemptions INTEGER NOT NULL CHECK (redemptions >= 0),
  spend REAL NOT NULL CHECK (spend >= 0),
  revenue REAL NOT NULL CHECK (revenue >= 0),
  segment_redemptions TEXT NOT NULL CHECK (json_valid(segment_redemptions)),
  PRIMARY KEY (campaign_id, date)
) STRICT;

CREATE INDEX idx_campaigns_advertiser ON campaigns (advertiser_id);
CREATE INDEX idx_campaigns_status ON campaigns (status);
