-- Restore the status CHECK on the report-export queue.
--
-- The original table (migration 20261029160000_report_exports) constrained
-- `status` to ('queued', 'processing'). The visual-refresh migration dropped
-- the whole table, and Prisma does not model CHECK constraints, so this has to
-- be re-applied by hand. Keeping it stops a worker or a manual repair from
-- writing a status the drain query cannot recognise.

ALTER TABLE "report_export_queue"
  ADD CONSTRAINT "report_export_queue_status_check"
  CHECK ("status" IN ('queued', 'processing'));
