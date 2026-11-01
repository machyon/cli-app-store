# Database Documentation — `cli-app-store`

This document describes the PostgreSQL database behind the CLI app store: how to connect, the schema, constraints, indexes, views, and the trigger(s) that run on writes.

Everything here was taken from the live database on **2026-11-01** (Aiven service `pg-cli-app-store`, project `pengki`), not from migration files. If the schema changes, re-check the live database and update this file.

---

## 1. Hosting

| Item | Value |
| --- | --- |
| Provider | Aiven (managed PostgreSQL) |
| Aiven project | `pengki` |
| Service name | `pg-cli-app-store` |
| Service type | `pg` |
| PostgreSQL version | 18.6 |
| Cloud / region | `do-blr` (DigitalOcean, Bangalore) |
| Plan | `free-1-1gb` (1 node, 1 CPU, 1 GB) |
| State | `RUNNING` |
| Maintenance window | Saturdays 01:29:42 UTC (enabled) |
| Termination protection | Off |
| Database | `defaultdb` |
| Application schema | `public` (all app tables live here) |

The database uses the `pg_trgm` (trigram search) and `plpgsql` extensions.

> **Note:** The empty `store` schema was dropped on 2026-11-01. Only `public` remains.

---

## 2. Connecting

### 2.1 Connection string

The app connects with `DATABASE_URL` from `.env` in the project root. The TLS certificate is `certs/ca.pem`. `backend/server.mjs` removes `sslmode` from the URL and sets TLS from `ca.pem` with `rejectUnauthorized: true`.

Never commit `.env`, and never print `DATABASE_URL` into logs or docs.

### 2.2 With `psql`

```bash
cd "cli_app_store"
set -a; . ./.env; set +a          # load DATABASE_URL into the shell
export PGSSLROOTCERT="$PWD/certs/ca.pem"
psql "$DATABASE_URL"
```

Useful one-liners:

```bash
psql "$DATABASE_URL" -c '\dt public.*'        # list tables
psql "$DATABASE_URL" -c '\d+ public.apps'     # describe a table
psql "$DATABASE_URL" -c 'select count(*) from public.apps;'
```

### 2.3 With the Aiven CLI (`avn`)

```bash
avn service list --project pengki
avn service get pg-cli-app-store --project pengki
avn service get pg-cli-app-store --project pengki --json
```

`avn service get` returns the connection URI, which contains the password. Do not paste that output into tickets, commits or chat. Use `.env` instead.

Interactive shell via the Aiven CLI:

```bash
avn service cli pg-cli-app-store --project pengki
```

### 2.4 With Node (`pg`)

`backend/server.mjs` already holds a pool. The health endpoint runs `SELECT NOW(), version()`:

```bash
node backend/server.mjs          # listens on BACKEND_PORT or 8080
curl http://localhost:8080/health
```

---

## 3. Schema overview

```
categories ──┐
             │ 1..*
programming_languages ─┐        licenses ──┐
                       │ 0..1             │ 1..*
                       ▼                  ▼
linux_distros ◄── package_managers    app_licenses ◄── apps ──► app_features
      ▲                  ▲                              │ 1..*
      │                  │ 1..*                         ├──► app_os_support
      │           app_packages ◄──────────────────────── ├──► app_packages
      │                                                 ├──► app_demo_lines
      │                                                 └──► releases ──► release_assets ──► download_events
      └──────────────────────── download_events (optional distro)
```

### 3.1 Table list

| Table | Rows (2026-11-01) | Purpose |
| --- | ---: | --- |
| `apps` | 8 | Catalog entries: one row per CLI app |
| `categories` | 5 | App categories (e.g. search, file managers) |
| `programming_languages` | 3 | Implementation languages |
| `licenses` | 3 | SPDX licenses |
| `app_licenses` | 10 | Many-to-many: apps ↔ licenses |
| `app_features` | 24 | Ordered feature bullet points per app |
| `app_demo_lines` | 24 | Ordered demo/terminal transcript lines per app |
| `app_os_support` | 21 | Operating systems each app supports |
| `linux_distros` | 3 | Linux distributions (for distro-specific installs) |
| `package_managers` | 9 | Install tools (apt, pacman, brew, cargo, …) |
| `app_packages` | 46 | Package name per app per package manager |
| `releases` | 8 | Versioned releases of an app |
| `release_assets` | 21 | Downloadable binaries per release (OS + arch) |
| `download_events` | 0 | Analytics: one row per asset download |

### 3.2 Views

| View | Based on | Purpose |
| --- | --- | --- |
| `latest_releases` | `releases` | Latest non-prerelease release per app (`DISTINCT ON (app_id)`, ordered by `released_at DESC, id DESC`) |
| `app_cards` | `apps`, `categories`, `app_os_support`, `latest_releases` | Summary row for listing pages, with `category_slug`, `latest_version`, and `support` (array of OS) |
| `app_details` | `apps`, `categories`, `programming_languages`, `latest_releases`, `app_licenses`, `licenses` | Full detail row for one app, with `license` ids, category, language, latest version and release date |
| `app_feature_list` | `app_features`, `apps` | Features of published apps, in order |
| `app_install_options` | `app_packages`, `apps`, `package_managers`, `linux_distros` | Ready-to-run install command per app and package manager. `command` is `command_override` if set, otherwise `command_template` with `{package}` replaced |
| `app_download_links` | `latest_releases`, `apps`, `release_assets` | Download URL, OS, arch, file name, size and SHA-256 for the latest release of each published app |
| `asset_download_totals` | `release_assets`, `download_events` | Download count per asset (includes assets with 0 downloads) |

Views filter `apps.is_published` where it matters (`app_feature_list`, `app_install_options`, `app_download_links`). `app_cards` and `app_details` do not filter by it.

---

## 4. Types

### 4.1 Enums

| Type | Values |
| --- | --- |
| `app_status` | `stable`, `beta`, `experimental`, `maintenance` |
| `operating_system` | `windows`, `macos`, `linux` |
| `cpu_arch` | `x86_64`, `arm64`, `x86`, `armv7` |
| `package_manager_kind` | `distro`, `other` |

### 4.2 Domains and functions

No user-defined domains. Public functions are `set_updated_at()` (trigger function, see §6) and the `pg_trgm` functions (`similarity`, `word_similarity`, `show_trgm`, …) which come from the extension.

---

## 5. Tables

Column notation: `PK` primary key, `FK` foreign key, `UQ` unique, `NN` not null.

### 5.1 `categories`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | integer | NN | — | PK |
| `slug` | text | NN | — | UQ, must match `^[a-z0-9][a-z0-9-]*$` |
| `name` | text | NN | — | |
| `description` | text | yes | — | |
| `sort_order` | integer | NN | `0` | |

### 5.2 `programming_languages`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | integer | NN | — | PK |
| `name` | text | NN | — | UQ |

### 5.3 `licenses`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | integer | NN | — | PK |
| `spdx_id` | text | NN | — | UQ, e.g. `MIT` |
| `name` | text | NN | — | |

### 5.4 `apps`

The main catalog table.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | NN | `uuidv7()` | PK |
| `slug` | text | NN | — | UQ, must match `^[a-z0-9][a-z0-9-]*$` |
| `name` | text | NN | — | |
| `tagline` | text | NN | — | |
| `about` | text | NN | — | |
| `category_id` | integer | NN | — | FK → `categories.id` (`ON DELETE RESTRICT`) |
| `language_id` | integer | yes | — | FK → `programming_languages.id` (`ON DELETE RESTRICT`) |
| `status` | `app_status` | NN | `'stable'` | |
| `github_owner` | text | NN | — | UQ together with `github_repo`; matches `^[A-Za-z0-9][A-Za-z0-9-]*$` |
| `github_repo` | text | NN | — | Matches `^[A-Za-z0-9._-]+$` |
| `stars_count` | integer | NN | `0` | GitHub stargazers. Must be `>= 0`. Synced from GitHub API |
| `forks_count` | integer | NN | `0` | GitHub forks. Must be `>= 0`. Synced from GitHub API |
| `github_synced_at` | timestamptz | yes | — | When the GitHub figures above were last fetched |
| `is_published` | boolean | NN | `true` | Hides the app from published views |
| `created_at` | timestamptz | NN | `now()` | |
| `updated_at` | timestamptz | NN | `now()` | **Maintained by trigger `apps_set_updated_at`** (§6) |
| `github_url` | text | yes | — | |
| `search_vector` | tsvector | yes | — | Full-text index (GIN). **Maintained by trigger `apps_set_search_vector`** (§6): weight A = `name`, B = `tagline`, C = `about`, English config |

### 5.5 `app_licenses`

Junction table: apps ↔ licenses.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `app_id` | uuid | NN | PK part, FK → `apps.id` `ON DELETE CASCADE` |
| `license_id` | integer | NN | PK part, FK → `licenses.id` `ON DELETE RESTRICT` |

### 5.6 `app_features`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `app_id` | uuid | NN | PK part, FK → `apps.id` `ON DELETE CASCADE` |
| `ordinal` | smallint | NN | PK part, must be `> 0`. Display order |
| `body` | text | NN | Feature text |

### 5.7 `app_demo_lines`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `app_id` | uuid | NN | PK part, FK → `apps.id` `ON DELETE CASCADE` |
| `line_no` | smallint | NN | PK part, must be `> 0` |
| `content` | text | NN | Transcript line |
| `is_prompt` | boolean | yes | Whether the line is a shell prompt. No default |

### 5.8 `app_os_support`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `app_id` | uuid | NN | PK part, FK → `apps.id` `ON DELETE CASCADE` |
| `os` | `operating_system` | NN | PK part |

Referenced by `release_assets` through the composite FK `(app_id, os)`. An asset can only exist for an OS the app supports.

### 5.9 `linux_distros`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | integer | NN | — | PK |
| `slug` | text | NN | — | UQ, slug format check |
| `name` | text | NN | — | |
| `ua_keywords` | text[] | NN | `'{}'` | Keywords to match in User-Agent strings for auto-detection |
| `sort_order` | integer | NN | `0` | |

### 5.10 `package_managers`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | integer | NN | — | PK |
| `slug` | text | NN | — | UQ, slug format check |
| `name` | text | NN | — | |
| `kind` | `package_manager_kind` | NN | — | `distro` or `other` |
| `os_hint` | `operating_system` | yes | — | |
| `distro_id` | integer | yes | — | FK → `linux_distros.id` (`ON DELETE RESTRICT`) |
| `command_template` | text | NN | — | Must contain `{package}`. Example: `sudo pacman -S {package}` |

Checks:
- `distro_managers_are_linux`: a `distro` manager must have `os_hint = 'linux'` (or NULL).
- `distro_managers_have_a_distro`: `kind = 'distro'` if and only if `distro_id IS NOT NULL`.

### 5.11 `app_packages`

Package name for each app in each package manager.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `app_id` | uuid | NN | PK part, FK → `apps.id` `ON DELETE CASCADE` |
| `package_manager_id` | integer | NN | PK part, FK → `package_managers.id` `ON DELETE RESTRICT` |
| `package_name` | text | NN | Package name for the template |
| `command_override` | text | yes | Full install command. Replaces the template when set |

### 5.12 `releases`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | NN | `uuidv7()` | PK |
| `app_id` | uuid | NN | — | FK → `apps.id` `ON DELETE CASCADE`. UQ `(app_id, version)` |
| `version` | text | NN | — | Must match `^[0-9A-Za-z][0-9A-Za-z.+_-]*$` |
| `released_at` | timestamptz | NN | — | No default |
| `is_prerelease` | boolean | NN | `false` | Prereleases are excluded from `latest_releases` |
| `release_url` | text | yes | — | Must start with `https://` |
| `created_at` | timestamptz | NN | `now()` | |
| `updated_at` | timestamptz | NN | `now()` | **Maintained by trigger `releases_set_updated_at`** (§6) |

Also has UQ `(id, app_id)`, which lets `release_assets` enforce that an asset's `app_id` matches its release's app.

### 5.13 `release_assets`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | NN | `uuidv7()` | PK |
| `release_id` | uuid | NN | — | FK `(release_id, app_id)` → `releases(id, app_id)` `ON DELETE CASCADE` |
| `app_id` | uuid | NN | — | Part of the composite FK |
| `os` | `operating_system` | NN | — | FK `(app_id, os)` → `app_os_support(app_id, os)` |
| `arch` | `cpu_arch` | NN | — | UQ `(release_id, os, arch)` |
| `file_name` | text | NN | — | Must not contain `/` or `\` |
| `size_bytes` | bigint | NN | — | Must be `> 0` |
| `sha256` | text | yes | — | Must be 64 lowercase hex characters when set |
| `download_url` | text | NN | — | Must start with `https://` |
| `created_at` | timestamptz | NN | `now()` | |

### 5.14 `download_events`

Append-only analytics.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | NN | `uuidv7()` | PK |
| `asset_id` | uuid | NN | — | FK → `release_assets.id` `ON DELETE CASCADE` |
| `occurred_at` | timestamptz | NN | `now()` | Indexed with BRIN and, with `asset_id`, a btree |
| `detected_os` | `operating_system` | yes | — | OS detected from the request |
| `detected_distro_id` | integer | yes | — | FK → `linux_distros.id` `ON DELETE SET NULL` |
| `selected_manually` | boolean | NN | `false` | Whether the user chose the asset manually |

---

## 6. Triggers and functions

There are exactly **three triggers** in the database: two that maintain `updated_at` (§6.1–6.2) and one that maintains `search_vector` (§6.3).

### 6.1 Function: `public.set_updated_at()`

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$function$;
```

What it does:
- Sets `updated_at` on the row being written to `clock_timestamp()`, the actual wall-clock time at execution.
- Any value the caller sends for `updated_at` is overwritten, so clients can't set it.
- Returns `NEW`, so the update goes ahead. It does not change any other column.

### 6.2 Triggers

| Trigger | Table | Timing | Event | Action | Enabled |
| --- | --- | --- | --- | --- | --- |
| `apps_set_updated_at` | `public.apps` | `BEFORE` | `UPDATE`, `FOR EACH ROW` | `EXECUTE FUNCTION set_updated_at()` | Yes (`O`, origin) |
| `releases_set_updated_at` | `public.releases` | `BEFORE` | `UPDATE`, `FOR EACH ROW` | `EXECUTE FUNCTION set_updated_at()` | Yes (`O`, origin) |
| `apps_set_search_vector` | `public.apps` | `BEFORE` | `INSERT`, or `UPDATE OF name, tagline, about`, `FOR EACH ROW` | `EXECUTE FUNCTION apps_set_search_vector()` | Yes (`O`, origin) |

Definitions, as reported by `pg_get_triggerdef`:

```sql
CREATE TRIGGER apps_set_updated_at BEFORE UPDATE ON public.apps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER releases_set_updated_at BEFORE UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Behaviour to know about:
- **Fires on every `UPDATE`, even when no data changed.** An update that sets a column to its current value still bumps `updated_at`.
- **Does not fire on `INSERT`.** On insert, `updated_at` gets its column default, `now()`. That is the transaction start time. After an insert, `created_at` and `updated_at` are the same.
- **`now()` vs `clock_timestamp()`.** The default uses `now()`, which is the start of the transaction. The trigger uses `clock_timestamp()`, which is the time the row is written. Inside one long transaction, the insert value and the update value can differ in meaning. This is expected.
- **Other tables have no `updated_at` trigger.** `app_*`, `categories`, `licenses`, `release_assets`, `download_events` and the lookup tables have no `updated_at` column or trigger.
- **`created_at` is never touched by a trigger.** Set it at insert time only.

### 6.3 Function and trigger: `apps_set_search_vector`

```sql
CREATE OR REPLACE FUNCTION public.apps_set_search_vector()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.tagline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.about, '')), 'C');
  RETURN NEW;
END;
$f$;

CREATE TRIGGER apps_set_search_vector BEFORE INSERT OR UPDATE OF name, tagline, about ON public.apps
  FOR EACH ROW EXECUTE FUNCTION public.apps_set_search_vector();
```

- Rebuilds `search_vector` from `name` (weight A), `tagline` (B) and `about` (C) whenever one of those columns is inserted or changed. Changes to other columns, such as stars, don't rebuild it.
- Any `search_vector` value sent by a client is overwritten.
- Search example: `WHERE search_vector @@ websearch_to_tsquery('english', 'file manager')` returns `yazi`. `'fuzzy'` returns `fzf`.
- Backfilled for all 8 existing apps on 2026-11-01.

---

## 7. Constraints summary

| Kind | Where | Details |
| --- | --- | --- |
| Primary keys | Every table | `apps.id`, `releases.id`, `release_assets.id`, `download_events.id` (uuid). Composite keys on `app_licenses`, `app_features`, `app_demo_lines`, `app_os_support`, `app_packages`. Integer keys on lookup tables |
| Foreign keys — cascade | `app_*` tables, `releases`, `release_assets`, `download_events` | Deleting an `apps` row removes its features, demo lines, OS support, packages, licenses, releases and their assets. Deleting an asset removes its download events |
| Foreign keys — restrict | `apps.category_id`, `apps.language_id`, `app_licenses.license_id`, `app_packages.package_manager_id`, `package_managers.distro_id` | You can't delete a category, language, license, package manager or distro that is still referenced |
| Foreign keys — set null | `download_events.detected_distro_id` | Deleting a distro sets it to NULL in old events |
| Unique | `apps.slug`, `apps (github_owner, github_repo)`, `categories.slug`, `licenses.spdx_id`, `linux_distros.slug`, `package_managers.slug`, `programming_languages.name`, `releases (app_id, version)`, `release_assets (release_id, os, arch)` | |
| Check — slugs | `apps`, `categories`, `linux_distros`, `package_managers` | `^[a-z0-9][a-z0-9-]*$` |
| Check — values | `apps.stars_count >= 0`, `apps.forks_count >= 0`, `app_features.ordinal > 0`, `app_demo_lines.line_no > 0`, `release_assets.size_bytes > 0` | |
| Check — formats | `apps.github_owner`, `apps.github_repo`, `releases.version`, `releases.release_url`, `release_assets.file_name`, `release_assets.sha256`, `release_assets.download_url`, `package_managers.command_template` | See §5 |
| Not null | All columns marked NN in §5 | |

---

## 8. Indexes

| Index | Table | Definition | Used for |
| --- | --- | --- | --- |
| `apps_pkey` | apps | `(id)` UNIQUE | PK |
| `apps_slug_key` | apps | `(slug)` UNIQUE | Lookup by slug |
| `apps_github_owner_github_repo_key` | apps | `(github_owner, github_repo)` UNIQUE | Lookup by repo |
| `apps_category_idx` | apps | `(category_id) WHERE is_published` | Published apps per category (partial) |
| `apps_status_idx` | apps | `(status) WHERE is_published` | Published apps by status (partial) |
| `apps_language_idx` | apps | `(language_id)` | Apps per language |
| `apps_name_trgm_idx` | apps | `GIN (name gin_trgm_ops)` | Fuzzy name search (`pg_trgm`) |
| `apps_search_idx` | apps | `GIN (search_vector)` | Full-text search |
| `app_licenses_license_idx` | app_licenses | `(license_id)` | Apps per license |
| `app_packages_manager_idx` | app_packages | `(package_manager_id)` | Apps per package manager |
| `releases_latest_idx` | releases | `(app_id, released_at DESC) WHERE NOT is_prerelease` | `latest_releases` view |
| `releases_id_app_id_key` / `releases_app_id_version_key` | releases | UNIQUE | Composite FK and version lookup |
| `release_assets_app_os_idx` | release_assets | `(app_id, os)` | Downloads per app and OS |
| `download_events_asset_idx` | download_events | `(asset_id, occurred_at DESC)` | Per-asset history |
| `download_events_time_idx` | download_events | `BRIN (occurred_at)` | Large time-range scans. BRIN is cheap but only useful for big tables |
| Primary keys and unique keys on lookup tables | categories, licenses, linux_distros, package_managers, programming_languages | — | |

---

## 9. Data notes

- **IDs:** `apps`, `releases`, `release_assets` and `download_events` use `uuidv7()`. Time-ordered UUIDs, so inserts append well to the btree indexes.
- **Enums vs tables:** OS, arch and status are enums (fixed sets). Categories, licenses, package managers and distros are tables, so they can change without a migration.
- **Publishing:** `apps.is_published` controls what the public views show. `releases.is_prerelease` controls what counts as "latest".
- **Installs:** `app_install_options` gives the command a user runs. It uses `command_override` when set, otherwise the package manager's `command_template` with `{package}` replaced.
- **GitHub figures:** `stars_count` and `forks_count` were fetched from the public GitHub REST API (`repos/{owner}/{repo}`) on 2026-11-01 and stored with `github_synced_at`. They are a snapshot and go stale. Refresh them with the same API call. Only public repo data is stored. Not fetched or stored: watchers, open issues, license, description, last push. Licenses are already in `app_licenses`.
- **Archived or stale repos:** `ogham/exa` was last pushed 2024-09-24. Its figures are current, but the project may be unmaintained.
- **Downloads:** `download_events` is empty (0 rows) on 2026-11-01, so `asset_download_totals` shows zero for every asset.
- **Sizes:** The whole database is about 9 MB. The tables hold a few hundred rows.

---

## 10. Verifying the documentation against the live database

These commands produce the facts above. Re-run them after a schema change:

```bash
set -a; . ./.env; set +a; export PGSSLROOTCERT="$PWD/certs/ca.pem"

# tables, views, functions
psql "$DATABASE_URL" -c '\dt public.*' -c '\dv public.*' -c '\df public.*'

# triggers (should list exactly apps_set_updated_at and releases_set_updated_at)
psql "$DATABASE_URL" -c "select c.relname, t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal;"

# function body
psql "$DATABASE_URL" -c "select pg_get_functiondef('public.set_updated_at'::regproc);"

# constraints
psql "$DATABASE_URL" -c "select conrelid::regclass::text, conname, contype, pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2;"
```

---

## 11. Changing the schema

- Make schema changes in a migration or with `psql`, and record them here.
- If you change `set_updated_at()` or the triggers, update §6 as well.
- Any change to `apps` or `releases` triggers will also affect `updated_at` for existing rows on their next update.
- Confirm `.env` is not committed (`.gitignore`) and never paste connection strings into docs, issues or chat.
