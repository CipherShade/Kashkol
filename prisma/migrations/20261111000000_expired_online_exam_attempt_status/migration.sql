-- Online exam attempts can be marked expired when they time out (`F-P3-01`).
-- Attempts that are neither submitted nor still within their time window must no longer
-- remain `in_progress` forever, and they still count toward the max-attempts limit.
-- Keep this as its own additive migration so the new value is available to later statememts.

ALTER TYPE "online_exam_attempt_status" ADD VALUE IF NOT EXISTS 'expired';
