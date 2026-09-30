# Shared helpers for the backup scripts. Sourced, not run.
# Reads DATABASE_URL from the environment, or from backend/.env.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$here/../backend/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$here/../backend/.env" | head -1 | cut -d= -f2- | tr -d '"')"
fi
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL is not set" >&2; exit 1; }

re='^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/([^?]+)'
[[ "$DATABASE_URL" =~ $re ]] || { echo "Cannot read DATABASE_URL" >&2; exit 1; }
DB_USER="${BASH_REMATCH[2]}"; DB_PASS="${BASH_REMATCH[3]}"; DB_HOST="${BASH_REMATCH[4]}"
DB_PORT="${BASH_REMATCH[5]:-5432}"; DB_NAME="${BASH_REMATCH[6]}"

# Run a Postgres tool on this machine, or inside a container when PG_DOCKER_CONTAINER is set
# (handy in development, where Postgres lives in Docker and the host has no client tools).
pg() {
  if [ -n "${PG_DOCKER_CONTAINER:-}" ]; then
    docker exec -i -e PGPASSWORD="$DB_PASS" "$PG_DOCKER_CONTAINER" "$1" -U "$DB_USER" "${@:2}"
  else
    PGPASSWORD="$DB_PASS" "$1" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "${@:2}"
  fi
}
