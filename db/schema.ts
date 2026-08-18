import { relations } from 'drizzle-orm';
import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

// Auth.js canonical tables, snake_case in the database and camelCase in Drizzle
// (the adapter binds to the Drizzle field names, so column naming stays ours).
// see: docs/decisions/auth.md

export const users = pgTable('users', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text('name'),
    email: text('email').unique(),
    emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
    image: text('image'),
    // GUEST or GOOGLE. Defaults to GUEST because the adapter's createUser (OAuth
    // only) does not set it; the guest path sets it explicitly.
    provider: text('provider').notNull().default('GUEST'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    // Owned by a database trigger, never written by the app.
    // see: docs/decisions/guest-cleanup.md
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
});

export const accounts = pgTable(
    'accounts',
    {
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        type: text('type').$type<'oauth' | 'oidc' | 'email' | 'webauthn'>().notNull(),
        provider: text('provider').notNull(),
        providerAccountId: text('provider_account_id').notNull(),
        refresh_token: text('refresh_token'),
        access_token: text('access_token'),
        expires_at: integer('expires_at'),
        token_type: text('token_type'),
        scope: text('scope'),
        id_token: text('id_token'),
        session_state: text('session_state'),
    },
    (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
    sessionToken: text('session_token').primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
    'verification_tokens',
    {
        identifier: text('identifier').notNull(),
        token: text('token').notNull(),
        expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
    },
    (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const usersRelations = relations(users, ({ many }) => ({
    accounts: many(accounts),
    sessions: many(sessions),
}));
