-- Raw feedback as ingested from sources (no AI processing yet)
CREATE TABLE IF NOT EXISTS feedback_raw (
  id            INTEGER PRIMARY KEY,
  timestamp     TEXT    NOT NULL,
  source        TEXT    NOT NULL, -- support_ticket | github | discord | reddit | twitter
  user_handle   TEXT    NOT NULL,
  content       TEXT    NOT NULL,
  -- source-specific fields (NULL when not applicable)
  priority      TEXT,             -- support_ticket
  status        TEXT,             -- support_ticket
  issue_title   TEXT,             -- github
  issue_labels  TEXT,             -- github (JSON array)
  channel_name  TEXT,             -- discord
  subreddit     TEXT,             -- reddit
  upvotes       INTEGER,          -- reddit
  likes         INTEGER,          -- twitter
  retweets      INTEGER           -- twitter
);

-- AI-processed fields added by the Workflows pipeline
CREATE TABLE IF NOT EXISTS feedback_processed (
  id              INTEGER PRIMARY KEY REFERENCES feedback_raw(id),
  product         TEXT    NOT NULL, -- workers-ai | d1 | workflows
  theme           TEXT    NOT NULL,
  sentiment       TEXT    NOT NULL CHECK(sentiment IN ('positive', 'negative', 'neutral')),
  sentiment_score REAL    NOT NULL CHECK(sentiment_score BETWEEN -1.0 AND 1.0),
  urgency         INTEGER NOT NULL CHECK(urgency BETWEEN 1 AND 4),
  urgency_label   TEXT    NOT NULL
);

-- Indexes for dashboard query patterns
CREATE INDEX IF NOT EXISTS idx_raw_source    ON feedback_raw(source);
CREATE INDEX IF NOT EXISTS idx_raw_timestamp ON feedback_raw(timestamp);
CREATE INDEX IF NOT EXISTS idx_proc_product  ON feedback_processed(product);
CREATE INDEX IF NOT EXISTS idx_proc_sentiment ON feedback_processed(sentiment);
CREATE INDEX IF NOT EXISTS idx_proc_theme    ON feedback_processed(theme);
CREATE INDEX IF NOT EXISTS idx_proc_urgency  ON feedback_processed(urgency);
