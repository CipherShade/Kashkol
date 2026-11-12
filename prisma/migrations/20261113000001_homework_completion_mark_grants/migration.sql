-- Migration: 20261113000001_homework_completion_mark_grants
--
-- `20261108000004_homework_completion_marks` created `homework_completion_mark`
-- without granting the application role any privileges, unlike every other
-- tenant table. CI masked this through `ALTER DEFAULT PRIVILEGES` issued by the
-- migration role, and fresh databases fail with `permission denied for table
-- homework_completion_mark` (SQLSTATE 42501).
--
-- This migration grants the application role the same privileges it holds on
-- every other tenant table (ADR-0006). Historical migrations are not modified.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "homework_completion_mark" TO kashkol_app;
