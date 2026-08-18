-- Subtitle files cached in the database rather than on disk: a serverless
-- filesystem is ephemeral, and every re-download costs OpenSubtitles quota that
-- is measured in single digits per day. see: docs/decisions/subtitles.md

CREATE TABLE subtitle_cache (
    file_id bigint PRIMARY KEY,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The sweep drops entries past the TTL.
CREATE INDEX idx_subtitle_cache_created ON subtitle_cache (created_at);
