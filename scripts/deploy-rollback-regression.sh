#!/usr/bin/env bash
set -euo pipefail
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
APP="$ROOT/app"; BIN="$ROOT/bin"; mkdir -p "$APP/backend" "$APP/dist" "$BIN"
printf old-backend > "$APP/backend/state"; printf old-dist > "$APP/dist/index.html"
git -C "$APP" init -q; git -C "$APP" config user.email test@example.invalid; git -C "$APP" config user.name Test
git -C "$APP" add .; git -C "$APP" commit -qm checkpoint
cat > "$BIN/pm2" <<'SH'
#!/usr/bin/env bash
exit 0
SH
cat > "$BIN/curl" <<'SH'
#!/usr/bin/env bash
exit 22
SH
cat > "$BIN/sleep" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "$BIN"/*
set +e
PATH="$BIN:$PATH" APP="$APP" BACKUPS="$ROOT/backups" LOGS="$ROOT/logs" PM2_APP=test HEALTH_URL=http://unhealthy.invalid /home/ubuntu/deploy.sh >/dev/null 2>&1
status=$?
set -e
[[ $status -ne 0 ]] || { echo 'expected deploy failure'; exit 1; }
[[ $(cat "$APP/backend/state") == old-backend ]]
[[ $(cat "$APP/dist/index.html") == old-dist ]]
echo 'deploy rollback regression passed: forced health failure restored backend and dist'
