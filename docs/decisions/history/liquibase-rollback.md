# Liquibase rollback — debugging session (2026-08-15)

Hard-won knowledge. Do NOT make a future agent re-derive this. If a
Liquibase rollback ever reports **"0 changesets rolled back"** despite
EXECUTED changesets being present, the answer is almost certainly here.

## Symptom

`mvn liquibase:rollback -Dliquibase.rollbackCount=1` (or 3) against a DB with
3 EXECUTED changesets returned `INFO: 0 changesets rolled back.` / BUILD
SUCCESS — silently doing nothing, no error.

## Root cause (path identity mismatch)

Liquibase matches "already ran" changesets by id + author + **normalized file
path** (`RanChangeSet.isSameAs` → `DatabaseChangeLog.normalizePath`, which
only strips `classpath:` and backslashes — nothing else).

- The Spring Boot app runs the changelog from the classpath
  (`spring.liquibase.change-log=classpath:db/changelog/master.yaml`), so
  `databasechangelog.FILENAME` stores classpath-relative paths:
  `db/changelog/0001-baseline.sql`.
- The Maven CLI was parsing from disk:
  `changeLogFile=src/main/resources/db/changelog/master.yaml` → parsed paths
  `src/main/resources/db/changelog/...`.
- The two never match → the already-ran filter matches nothing → the count
  filter has nothing to count → 0 changesets, reported as success.

This was confirmed by disassembling Liquibase 5.0.3 bytecode with javap
(ChangeLogIterator, AlreadyRanChangeSetFilter, RanChangeSet.isSameAs,
AbstractRollbackCommandStep.doRollback).

## Fix

`backend/liquibase.properties` must resolve paths the same classpath-relative
way (baked in, with an explanatory comment):

```properties
changeLogFile=db/changelog/master.yaml
searchPath=src/main/resources
```

Key name is `searchPath` (the Maven mojo field), NOT `liquibase.searchPath` —
the latter works through the global config but logs an ugly warning
("'liquibase.searchPath' in properties file is not being used by this task"

- a NoSuchFieldException stack, harmless but noisy).

Verified on a scratch DB: up → down (`rollbackCount=1` dropped
profile_picture_url + deleted the tracking row) → up (`update` re-applied).
Scratch DB dropped after.

## Working commands (Liquibase 5)

Liquibase 5 has ONE `rollback` goal. `rollbackCount`/`rollback-one-changeset`
goals are GONE.

From `backend/`, via `cmd /c` (PowerShell 5.1 mangles `-D` args with `=`/`:`
— it turned a JDBC URL into a Maven plugin coordinate once):

```powershell
cmd /c "cd /d C:\Users\minec\Desktop\tv-pirate\backend && .\mvnw.cmd liquibase:rollbackSQL -Dliquibase.propertyFile=liquibase.properties -Dliquibase.rollbackCount=1"   # dry run → SQL at target/liquibase/migrate.sql
cmd /c "cd /d C:\Users\minec\Desktop\tv-pirate\backend && .\mvnw.cmd liquibase:rollback -Dliquibase.propertyFile=liquibase.properties -Dliquibase.rollbackCount=1"       # real down
cmd /c "cd /d C:\Users\minec\Desktop\tv-pirate\backend && .\mvnw.cmd liquibase:update -Dliquibase.propertyFile=liquibase.properties"                                      # up
```

Other target DB: add `-Dliquibase.url=jdbc:postgresql://localhost:5432/<db>`.

## v5 Maven plugin gotchas (all observed, all real)

- `-Dliquibase.propertyFile=liquibase.properties` is REQUIRED — the plugin
  does NOT auto-read the default propertyFile (you get "database URL has not
  been specified" otherwise).
- The propertyFile is resolved AGAINST `searchPath`. If searchPath is set via
  `-D` before the file loads, the file is "not found". Keep searchPath only
  inside the properties file, so the file is found via the default cwd path
  first.
- `classpath:` changelog URLs do NOT work in the Maven plugin (v5 resolves
  them through the filesystem path handler → InvalidPathException).
- Rollback dry-run output goes to `backend/target/liquibase/migrate.sql`.
- `--rollback <sql>` in formatted SQL is a parser DIRECTIVE (like
  `--changeset`), not a comment — that IS the TypeORM-style down().
- Formatted SQL preconditions: ONLY `--precondition-sql-check
expectedResult:<n> <SQL>`. `tableExists` etc. are XML/YAML vocabulary and
  are silently ignored if used in formatted SQL.
- Prose `--` comments must not START with a directive keyword (changeset,
  rollback, comment, liquibase, preconditions) — parse error.

## Where the durable docs live

- `backend/src/main/resources/db/changelog/agents.md` — the migration
  workflow + rollback commands + gotchas (folder-level agents.md)
- `backend/liquibase.properties.example` — committed template with the
  path-mismatch comment
- Root `agents.md` conventions mention the migration hard rule
