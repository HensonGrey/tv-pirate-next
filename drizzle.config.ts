import { defineConfig } from 'drizzle-kit';

// generate only — applying and rolling back go through db/migrate.mjs, which
// enforces the paired down file. see: docs/decisions/migrations.md
export default defineConfig({
    dialect: 'postgresql',
    schema: './db/schema.ts',
    out: './db/migrations',
    dbCredentials: { url: process.env.DATABASE_URL ?? '' },
    migrations: { table: '_migrations' },
});
