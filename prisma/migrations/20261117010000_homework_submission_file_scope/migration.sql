-- F-P2-03: a student submission file is a distinct file scope. Adding the enum
-- value in its own migration is required because PostgreSQL forbids using a
-- newly added enum value in the transaction that adds it.
ALTER TYPE "file_scope" ADD VALUE IF NOT EXISTS 'homework_submission';
