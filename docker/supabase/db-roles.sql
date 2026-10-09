-- Runs once on first database initialisation (empty data volume) via /docker-entrypoint-initdb.d/init-scripts.
-- Sets the passwords of the service roles from POSTGRES_PASSWORD. After a password rotation the
-- "migrate" job re-applies them (see migrate.sh).
\set pgpass `echo "$POSTGRES_PASSWORD"`
ALTER ROLE authenticator WITH PASSWORD :'pgpass';
ALTER ROLE supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'pgpass';
