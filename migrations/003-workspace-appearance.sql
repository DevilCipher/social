CREATE TABLE IF NOT EXISTS heart_appearance (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  payload JSONB NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO heart_appearance(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
