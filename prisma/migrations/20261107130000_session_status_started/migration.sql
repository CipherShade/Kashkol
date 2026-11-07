-- Sessions can be started and completed (`F-P1-07`). The application schema and
-- `src/modules/sessions/repository.ts` already write `status = 'started'`, but the
-- enum never received the value, so starting a session failed with an invalid enum
-- error. Adding the value in its own migration keeps it usable by later statements.
ALTER TYPE "session_status" ADD VALUE IF NOT EXISTS 'started';
