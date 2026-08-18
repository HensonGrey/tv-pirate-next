import { relations } from 'drizzle-orm';
import { bigint, integer, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

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

/** Server-backed favourites. media_type is part of the identity: TMDB runs two
 * id spaces, so movie 123 and tv 123 are different titles.
 * see: docs/decisions/favourites.md#schema */
export const favourites = pgTable(
    'favourites',
    {
        id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        tmdbId: bigint('tmdb_id', { mode: 'number' }).notNull(),
        mediaType: text('media_type').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [unique('uq_favourites_user_title').on(table.userId, table.tmdbId, table.mediaType)],
);

/** Per-user playback position. media_type is required because the two TMDB id
 * namespaces collide; movie rows carry NULL season/episode.
 * see: docs/decisions/watch-progress.md#schema */
export const watchProgress = pgTable('watch_progress', {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    tmdbId: bigint('tmdb_id', { mode: 'number' }).notNull(),
    mediaType: text('media_type').notNull(),
    seasonNumber: integer('season_number'),
    episodeNumber: integer('episode_number'),
    progressSeconds: integer('progress_seconds').notNull(),
    durationSeconds: integer('duration_seconds'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/** Downloaded subtitle files, keyed by the OpenSubtitles file id. The previous
 * stack cached these on disk; serverless filesystems are ephemeral, and
 * re-downloading would spend a daily quota that is only 5-10 files.
 * see: docs/decisions/subtitles.md */
export const subtitleCache = pgTable('subtitle_cache', {
    fileId: bigint('file_id', { mode: 'number' }).primaryKey(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
