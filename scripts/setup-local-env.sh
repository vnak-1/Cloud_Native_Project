#!/usr/bin/env bash
# Creates each service's .env for running locally (with node or docker compose), starting
# from its .env.example. It:
#   - generates INTERNAL_KEY and JWT_SECRET once, so every service gets the same values
#   - asks for your Atlas connection string and the first admin's password (hidden as you
#     type, so they never appear in a command or in your shell history)
#   - puts the right database name at the end of MONGO_URI for each service
# Existing .env files are left alone (their INTERNAL_KEY and JWT_SECRET are reused).
# Run from anywhere:  ./scripts/setup-local-env.sh
set -euo pipefail
cd "$(dirname "$0")/.." # the repo root

SERVICES="gateway registration-service login-service equipment-service loan-service"

missing=""
for svc in $SERVICES; do
  [ -f "$svc/.env" ] || missing="$missing $svc"
done
if [ -z "$missing" ]; then
  echo "Every service already has a .env file. Nothing to do."
  exit 0
fi

# Replaces the line KEY=... in a file. Node does the edit, so every character of the value
# (/ & ? @ in a connection string) is kept exactly. The value is passed in an environment
# variable rather than on the command line.
set_value() { # set_value <file> <KEY> <value>
  VALUE="$3" node -e '
    const fs = require("fs");
    const [file, key] = process.argv.slice(1);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const updated = lines.map((line) => (line.startsWith(key + "=") ? key + "=" + process.env.VALUE : line));
    fs.writeFileSync(file, updated.join("\n"));
  ' "$1" "$2"
}

# A value from an existing .env (if it isn't still a <placeholder>), so secrets stay shared
existing_value() { # existing_value <KEY>
  local svc line value
  for svc in $SERVICES; do
    [ -f "$svc/.env" ] || continue
    line=$(grep -m1 "^$1=" "$svc/.env" || true)
    value=${line#*=}
    if [ -n "$line" ] && [ -n "$value" ] && [[ "$value" != \<* ]]; then
      echo "$value"
      return
    fi
  done
}

random_secret() { node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'; }

echo "Your Atlas connection string WITHOUT a database name,"
echo "like: mongodb+srv://<db-user>:<db-password>@<cluster-host>"
read -r -s -p "Paste it (hidden): " ATLAS
echo
read -r -s -p "Password for the first admin (at least 6 characters, hidden): " ADMIN_PASSWORD
echo
if [ -z "$ATLAS" ] || [ ${#ADMIN_PASSWORD} -lt 6 ]; then
  echo "Need a connection string and an admin password of at least 6 characters. Nothing written."
  exit 1
fi

# "<connection string>/<database>", keeping any ?options at the end
with_db() { # with_db <database>
  local base="${ATLAS%%\?*}" query=""
  if [[ "$ATLAS" == *\?* ]]; then
    query="?${ATLAS#*\?}"
  fi
  echo "${base%/}/$1$query"
}

INTERNAL_KEY=$(existing_value INTERNAL_KEY)
INTERNAL_KEY=${INTERNAL_KEY:-$(random_secret)}
JWT_SECRET=$(existing_value JWT_SECRET)
JWT_SECRET=${JWT_SECRET:-$(random_secret)}

for svc in $missing; do
  env_file="$svc/.env"
  cp "$svc/.env.example" "$env_file"
  set_value "$env_file" INTERNAL_KEY "$INTERNAL_KEY"
  case $svc in
    gateway)
      set_value "$env_file" JWT_SECRET "$JWT_SECRET"
      ;;
    registration-service)
      set_value "$env_file" MONGO_URI "$(with_db userdb)"
      set_value "$env_file" ADMIN_PASSWORD "$ADMIN_PASSWORD"
      ;;
    login-service)
      set_value "$env_file" MONGO_URI "$(with_db userdb)"
      set_value "$env_file" JWT_SECRET "$JWT_SECRET"
      ;;
    equipment-service)
      set_value "$env_file" MONGO_URI "$(with_db equipmentdb)"
      ;;
    loan-service)
      set_value "$env_file" MONGO_URI "$(with_db loandb)"
      ;;
  esac
  echo "wrote $env_file"
done

echo
echo "Done. The first admin logs in with ADMIN_EMAIL from registration-service/.env"
echo "(admin@aupp.edu.kh unless you change it) and the password you just typed."
