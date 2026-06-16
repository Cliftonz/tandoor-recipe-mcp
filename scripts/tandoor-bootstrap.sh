#!/usr/bin/env bash
# Boot a disposable Tandoor instance via docker-compose and provision an
# admin user + OAuth2 access token. Idempotent: re-runs reuse the existing
# user/space and create a fresh token each call.
#
# Outputs to stdout when GITHUB_ENV is not set:
#   TANDOOR_URL=<url>
#   TANDOOR_TOKEN=<token>
# When running in GitHub Actions: writes those plus TANDOOR_COMPOSE_FILE to
# $GITHUB_ENV, and stays silent on stdout for the token (the value is also
# masked via `::add-mask::` so it never appears verbatim in build logs).
#
# Designed for both local dev (`eval "$(scripts/tandoor-bootstrap.sh)"`) and
# GitHub Actions (`scripts/tandoor-bootstrap.sh`).
#
# Env overrides:
#   TANDOOR_TEST_DIR   — where docker-compose.yml lives (default: /tmp/tandoor-test)
#   TANDOOR_TEST_PORT  — host port to expose (default: 8088)

set -euo pipefail

# Restrictive umask so dev runs don't leak the compose / log files to other
# local users (Security F14).
umask 077

TEST_DIR="${TANDOOR_TEST_DIR:-/tmp/tandoor-test}"
PORT="${TANDOOR_TEST_PORT:-8088}"
URL="http://127.0.0.1:${PORT}"
COMPOSE_FILE="$TEST_DIR/docker-compose.yml"

mkdir -p "$TEST_DIR"
chmod 700 "$TEST_DIR"

# Per-run random credentials (Security F4 + F16). The dev SECRET_KEY and
# admin password are both random so even if F1's bind regresses (host bind
# 0.0.0.0), a snapshot of a single run doesn't help an attacker authenticate
# on the next run.
SECRET_KEY="$(openssl rand -hex 32)"
ADMIN_PASS="$(openssl rand -hex 16)"

cat > "$COMPOSE_FILE" <<EOF
services:
  db_recipes:
    restart: unless-stopped
    image: postgres:16-alpine
    environment:
      - POSTGRES_PASSWORD=tandoor
      - POSTGRES_USER=tandoor
      - POSTGRES_DB=tandoor
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tandoor"]
      interval: 5s
      timeout: 5s
      retries: 20
  web_recipes:
    restart: unless-stopped
    image: vabene1111/recipes:latest
    environment:
      - SECRET_KEY=$SECRET_KEY
      - DB_ENGINE=django.db.backends.postgresql
      - POSTGRES_HOST=db_recipes
      - POSTGRES_PORT=5432
      - POSTGRES_USER=tandoor
      - POSTGRES_PASSWORD=tandoor
      - POSTGRES_DB=tandoor
      - GUNICORN_MEDIA=1
      - DEBUG=0
      # Narrowed from "*" to localhost (Security F10). Defense-in-depth in
      # case the port mapping ever regresses to 0.0.0.0.
      - ALLOWED_HOSTS=127.0.0.1,localhost
      - TZ=UTC
    ports:
      # Explicit 127.0.0.1 prefix prevents docker-compose's short-syntax
      # default of binding on 0.0.0.0 (Security F1).
      - "127.0.0.1:${PORT}:80"
    depends_on:
      db_recipes:
        condition: service_healthy
EOF

# Up + wait for the compose healthchecks before polling Tandoor's HTTP layer.
docker compose -f "$COMPOSE_FILE" up -d --wait >&2 || docker compose -f "$COMPOSE_FILE" up -d >&2

# Polling phase with per-attempt visibility (Observability F13). Logs every
# iteration with elapsed time + last HTTP code so an operator can tell a slow
# boot from a stuck boot before the 5-minute deadline.
echo "[tandoor-bootstrap] waiting for Tandoor on $URL …" >&2
START=$(date +%s)
DEADLINE=$(( START + 300 ))
attempt=0
# Wall-clock cadence — log when elapsed - last_log_t >= LOG_INTERVAL so the
# cadence stays at ~9s even if curl --max-time or sleep duration is tuned
# later (Observability F10).
LOG_INTERVAL="${TANDOOR_BOOTSTRAP_LOG_INTERVAL:-9}"
last_log_t=$START
while true; do
  attempt=$(( attempt + 1 ))
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 --connect-timeout 2 "$URL/api/server-settings/current/" 2>/dev/null || echo "000")
  now=$(date +%s)
  elapsed=$(( now - START ))
  if [ "$code" = "200" ]; then
    echo "[tandoor-bootstrap] t=${elapsed}s http=200 attempt=${attempt} (ready)" >&2
    break
  fi
  if [ "$now" -gt "$DEADLINE" ]; then
    echo "[tandoor-bootstrap] Tandoor did not come up in 5 min (last http=${code})" >&2
    docker compose -f "$COMPOSE_FILE" ps >&2 || true
    docker compose -f "$COMPOSE_FILE" logs --tail 200 db_recipes >&2 || true
    docker compose -f "$COMPOSE_FILE" logs --tail 200 web_recipes >&2 || true
    exit 1
  fi
  if [ $(( now - last_log_t )) -ge $LOG_INTERVAL ]; then
    echo "[tandoor-bootstrap] t=${elapsed}s http=${code} attempt=${attempt}" >&2
    last_log_t=$now
  fi
  sleep 2
done

# Wait for Django migrations to drain. The web container can answer 200 on
# /api/server-settings/current/ before all migrations finish on some image
# builds, and the provisioning shell-exec below would then race the lock
# (QA F5).
PROJECT="$(basename "$TEST_DIR")"
WEB="${PROJECT}-web_recipes-1"
MIG_START=$(date +%s)
MIG_DEADLINE=$(( MIG_START + 120 ))
mig_attempt=0
last_pending="?"
mig_last_log_t=$MIG_START
while [ "$(date +%s)" -lt "$MIG_DEADLINE" ]; do
  mig_attempt=$(( mig_attempt + 1 ))
  pending=$(docker exec "$WEB" sh -c \
    'cd /opt/recipes && source venv/bin/activate && python manage.py showmigrations --plan 2>/dev/null | grep -c "\[ \]"' \
    2>/dev/null || echo "?")
  last_pending="$pending"
  mig_now=$(date +%s)
  if [ "$pending" = "0" ]; then
    echo "[tandoor-bootstrap][INFO] migrations settled after $(( mig_now - MIG_START ))s (attempts=${mig_attempt})" >&2
    break
  fi
  # Wall-clock cadence (matches the HTTP poll above). Operator can
  # distinguish "slow but progressing" from "stuck" before the deadline.
  if [ $(( mig_now - mig_last_log_t )) -ge $LOG_INTERVAL ]; then
    echo "[tandoor-bootstrap][INFO] migrations pending=${pending} t=$(( mig_now - MIG_START ))s attempt=${mig_attempt}" >&2
    mig_last_log_t=$mig_now
  fi
  sleep 2
done
# Deadline-on-exit log so a confusing OperationalError in bootstrap-django.log
# can be traced to "migrations never settled" instead of "image schema broke".
if [ "$last_pending" != "0" ]; then
  echo "[tandoor-bootstrap] migrations did not settle within 120s (last pending=${last_pending}). Continuing — provisioning shell-exec will race the migrations lock if any remain." >&2
fi

# Provision admin user + space + group + OAuth2 access token. Idempotent
# get_or_create for everything; fresh token each run so a rotated CI secret
# never reuses an old one. The Python prints the token with a sentinel
# prefix so a future Django stdout warning can't be mistaken for the token
# (Observability F5+F6). Django stderr is tee'd to a log we can dump on
# failure rather than discarded with `2>/dev/null`.
DJANGO_LOG="$TEST_DIR/bootstrap-django.log"
RAW=$(docker exec -e ADMIN_PASS="$ADMIN_PASS" "$WEB" sh -c "cd /opt/recipes && source venv/bin/activate && python manage.py shell -c \"
import os
from django.contrib.auth import get_user_model
from django.utils import timezone
from oauth2_provider.models import AccessToken, Application
from cookbook.models import UserSpace, Space, Group
import secrets, datetime

U = get_user_model()
u, _ = U.objects.get_or_create(username='e2e', defaults={'email':'e2e@x.test'})
u.set_password(os.environ['ADMIN_PASS'])
u.is_active = True
u.is_superuser = True
u.is_staff = True
u.save()

s, _ = Space.objects.get_or_create(name='e2e-space', defaults={'created_by': u})
us, _ = UserSpace.objects.get_or_create(user=u, space=s, defaults={'active': True})
us.active = True
admin_group, _ = Group.objects.get_or_create(name='admin')
us.groups.add(admin_group)
us.save()

up = u.userpreference
up.space = s
up.save()

app, _ = Application.objects.get_or_create(
    name='e2e-app', user=u,
    defaults={'client_type': 'confidential', 'authorization_grant_type': 'client-credentials'},
)
AccessToken.objects.filter(user=u, application=app).delete()
tok_str = secrets.token_urlsafe(32)
tok = AccessToken.objects.create(
    user=u, application=app, token=tok_str,
    expires=timezone.now() + datetime.timedelta(days=365),
    scope='read write',
)
print('__TOKEN__:' + tok.token)
\"" 2>"$DJANGO_LOG")

# Extract the sentinel-prefixed token. Any other stdout content (Django
# startup banners, deprecation warnings) is ignored, so a future Django
# release that adds a stdout warning won't silently break the bootstrap.
TOKEN=$(echo "$RAW" | grep '^__TOKEN__:' | sed 's/^__TOKEN__://' | tail -1)

# Shape validation — strong belt-and-braces against the F5/F6 stream-mixing
# failure mode. token_urlsafe(32) produces 43 chars of URL-safe base64.
if ! [[ "$TOKEN" =~ ^[A-Za-z0-9_-]{32,}$ ]]; then
  echo "[tandoor-bootstrap] token shape invalid (got ${#TOKEN} chars). Django log:" >&2
  cat "$DJANGO_LOG" >&2 || true
  exit 1
fi

# When running in GitHub Actions, mask the token before anything else so GHA
# redacts it in every subsequent log line — even an accidental future echo
# would still get scrubbed. Then write the assignments to $GITHUB_ENV (also
# auto-masked) and stay silent on stdout (Security F2).
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "::add-mask::$TOKEN"
  {
    echo "TANDOOR_URL=$URL"
    echo "TANDOOR_TOKEN=$TOKEN"
    echo "TANDOOR_COMPOSE_FILE=$COMPOSE_FILE"
    # Single source of truth for the Django log path so failure-artifact
    # uploads in e2e.yml + bootstrap-smoke.yml don't drift if TANDOOR_TEST_DIR
    # is ever overridden (Observability F13).
    echo "TANDOOR_BOOTSTRAP_LOG=$DJANGO_LOG"
  } >> "$GITHUB_ENV"
fi

# Local-dev eval pattern still needs the assignments on stdout. Outside CI
# we accept that the token ends up in the parent shell's scrollback —
# documented in the script header.
echo "TANDOOR_URL=$URL"
echo "TANDOOR_TOKEN=$TOKEN"
echo "TANDOOR_COMPOSE_FILE=$COMPOSE_FILE"
