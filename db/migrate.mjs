// Migration runner: applies numbered .sql files and rolls them back via their
// paired .down.sql. see: docs/decisions/migrations.md
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const TRACKING = `CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
)`;

function migrations() {
    return readdirSync(DIR)
        .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
        .sort();
}

function downFile(name) {
    return name.replace(/\.sql$/, '.down.sql');
}

async function main() {
    const command = process.argv[2] ?? 'status';
    const count = Number(process.argv[3] ?? 1);
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(TRACKING);
    const applied = new Set(
        (await client.query('SELECT name FROM _migrations ORDER BY name')).rows.map((r) => r.name),
    );

    try {
        if (command === 'status') {
            for (const name of migrations()) {
                console.log(`${applied.has(name) ? '[applied]' : '[pending]'} ${name}`);
            }
            if (migrations().length === 0) console.log('no migrations yet');
            return;
        }

        if (command === 'up') {
            const pending = migrations().filter((name) => !applied.has(name));
            if (pending.length === 0) return console.log('nothing to apply');
            for (const name of pending) {
                // Each migration runs in its own transaction: a failure leaves no half-state.
                await client.query('BEGIN');
                try {
                    await client.query(readFileSync(join(DIR, name), 'utf8'));
                    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
                    await client.query('COMMIT');
                    console.log(`applied ${name}`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    throw new Error(`${name} failed: ${error.message}`);
                }
            }
            return;
        }

        if (command === 'down') {
            const undoable = migrations()
                .filter((name) => applied.has(name))
                .reverse()
                .slice(0, count);
            if (undoable.length === 0) return console.log('nothing to roll back');
            for (const name of undoable) {
                // No down file is a hard error, not a skip — the rule is up + down, always.
                const sql = readFileSync(join(DIR, downFile(name)), 'utf8');
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query('DELETE FROM _migrations WHERE name = $1', [name]);
                    await client.query('COMMIT');
                    console.log(`rolled back ${name}`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    throw new Error(`${downFile(name)} failed: ${error.message}`);
                }
            }
            return;
        }

        throw new Error(`unknown command: ${command} (use status | up | down [n])`);
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
