/**
 * The newest migration that a deployable image expects to be applied.
 *
 * Update this constant in the same change that adds a migration. The project
 * rules check fails when it does not match the newest directory in
 * `prisma/migrations`, so the readiness endpoint cannot claim "migrations
 * applied" while the schema is behind.
 */
export const REQUIRED_MIGRATION_NAME = "20261111000000_expired_online_exam_attempt_status";
