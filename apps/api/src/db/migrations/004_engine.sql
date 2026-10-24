-- Decision engine: decision change log, hourly play totals, rule settings and learned conversion state

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  screen_id TEXT NOT NULL REFERENCES screens (id),
  sim_time TEXT NOT NULL,
  campaign_id TEXT REFERENCES campaigns (id),
  winning_rule TEXT NOT NULL,
  score REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('agent-verified', 'rule-based', 'delay-goodwill', 'airline-priority', 'manual-pin', 'house-default')),
  summary TEXT NOT NULL CHECK (json_valid(summary)),
  model_version TEXT NOT NULL
) STRICT;

CREATE TABLE play_stats_hourly (
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  screen_id TEXT NOT NULL REFERENCES screens (id),
  hour TEXT NOT NULL,
  plays INTEGER NOT NULL CHECK (plays >= 0),
  impressions INTEGER NOT NULL CHECK (impressions >= 0),
  spend REAL NOT NULL CHECK (spend >= 0),
  PRIMARY KEY (campaign_id, screen_id, hour)
) STRICT;

CREATE TABLE engine_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE learner_state (
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  segment TEXT NOT NULL,
  alpha REAL NOT NULL CHECK (alpha > 0),
  beta REAL NOT NULL CHECK (beta > 0),
  PRIMARY KEY (campaign_id, segment)
) STRICT;

CREATE INDEX idx_decisions_screen_time ON decisions (screen_id, sim_time);
CREATE INDEX idx_decisions_campaign ON decisions (campaign_id);
CREATE INDEX idx_play_stats_hour ON play_stats_hourly (hour);
