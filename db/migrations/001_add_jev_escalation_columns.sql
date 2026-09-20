-- 001_add_jev_escalation_columns.sql
-- Adds TypeSafe AI (Jev System One) enrichment fields to doses table

ALTER TABLE doses
  ADD COLUMN IF NOT EXISTS escalation_level VARCHAR,
  ADD COLUMN IF NOT EXISTS dropout_risk FLOAT;
