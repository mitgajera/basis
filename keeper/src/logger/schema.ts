export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS funding_rates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  venue       TEXT    NOT NULL,
  asset       TEXT    NOT NULL,
  hourly_rate REAL    NOT NULL,
  annualized_pct REAL NOT NULL,
  mark_price  REAL    NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fr_recorded ON funding_rates(recorded_at);
CREATE INDEX IF NOT EXISTS idx_fr_venue    ON funding_rates(venue, asset, recorded_at);

CREATE TABLE IF NOT EXISTS spreads (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  asset                 TEXT    NOT NULL,
  long_venue            TEXT    NOT NULL,
  short_venue           TEXT    NOT NULL,
  spread_annualized_pct REAL    NOT NULL,
  recorded_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sp_recorded ON spreads(recorded_at);

CREATE TABLE IF NOT EXISTS trades (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id TEXT    NOT NULL,
  venue          TEXT    NOT NULL,
  asset          TEXT    NOT NULL,
  side           TEXT    NOT NULL,
  size_usd       REAL    NOT NULL,
  size_base      REAL    NOT NULL DEFAULT 0,
  fill_price     REAL,
  exit_price     REAL,
  fee_usd        REAL    NOT NULL DEFAULT 0,
  pnl_usd        REAL,
  order_id       TEXT,
  status         TEXT    NOT NULL DEFAULT 'open',
  reason         TEXT,
  opened_at      INTEGER NOT NULL,
  closed_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tr_opp    ON trades(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_tr_status ON trades(status, opened_at);
CREATE INDEX IF NOT EXISTS idx_tr_venue  ON trades(venue, asset, status);

CREATE TABLE IF NOT EXISTS nav_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  total_assets_usd REAL    NOT NULL,
  total_shares     REAL    NOT NULL,
  nav_per_share    REAL    NOT NULL,
  recorded_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nav_recorded ON nav_history(recorded_at);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  severity    TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  data        TEXT,
  occurred_at INTEGER NOT NULL
);
`;
