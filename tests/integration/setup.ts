import { config } from "dotenv";
import { ensureIntegrationFixtures } from "./helpers";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Integration tests are hermetic: they always reach the app over localhost and never
// hit a real external origin. Pin the auth origin so a developer's tunnel URL in
// .env.local cannot break trusted-origin checks against "http://localhost:3000".
process.env.BETTER_AUTH_URL = "http://localhost:3000";

// Re-assert the disposable fixture workspace once per test file and archive
// its active fixtures so every file starts from a zero-cap baseline. The
// seeded tenants are never touched (docs/STATUS.md §5.9).
await ensureIntegrationFixtures();
