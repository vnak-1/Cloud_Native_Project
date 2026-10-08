#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICES="gateway registration-service login-service equipment-service loan-service"

template_for() {
  case $1 in
    gateway)
      printf '%s\n' PORT=3000 SERVICE_NAME=gateway JWT_SECRET= INTERNAL_KEY= \
        REGISTRATION_URL=http://localhost:3001 LOGIN_URL=http://localhost:3002 \
        EQUIPMENT_URL=http://localhost:3003 LOAN_URL=http://localhost:3004
      ;;
    registration-service)
      printf '%s\n' PORT=3001 SERVICE_NAME=registration-service MONGO_URI= INTERNAL_KEY= \
        ADMIN_EMAIL=admin@aupp.edu.kh ADMIN_PASSWORD=
      ;;
    login-service)
      printf '%s\n' PORT=3002 SERVICE_NAME=login-service MONGO_URI= INTERNAL_KEY= \
        JWT_SECRET= JWT_EXPIRES_IN=24h
      ;;
    equipment-service)
      printf '%s\n' PORT=3003 SERVICE_NAME=equipment-service INSTANCE_ID=equipment-1 \
        MONGO_URI= INTERNAL_KEY=
      ;;
    loan-service)
      printf '%s\n' PORT=3004 SERVICE_NAME=loan-service MONGO_URI= INTERNAL_KEY= \
        EQUIPMENT_URL=http://localhost:3003
      ;;
  esac
}

database_for() {
  case $1 in
    registration-service | login-service) echo userdb ;;
    equipment-service) echo equipmentdb ;;
    loan-service) echo loandb ;;
  esac
}

needs_value() {
  local line value
  line=$(grep -m1 "^$2=" "$1" || true)
  [ -n "$line" ] || return 1
  value=${line#*=}
  [ -z "$value" ] || [[ "$value" == *"<"* ]]
}

existing_value() {
  local svc line value
  for svc in $SERVICES; do
    [ -f "$svc/.env" ] || continue
    line=$(grep -m1 "^$1=" "$svc/.env" || true)
    value=${line#*=}
    if [ -n "$line" ] && [ -n "$value" ] && [[ "$value" != *"<"* ]]; then
      echo "$value"
      return
    fi
  done
}

set_value() {
  VALUE="$3" node -e '
    const fs = require("fs");
    const [file, key] = process.argv.slice(1);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const updated = lines.map((line) => (line.startsWith(key + "=") ? key + "=" + process.env.VALUE : line));
    fs.writeFileSync(file, updated.join("\n"));
  ' "$1" "$2"
}

random_secret() { node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'; }

random_password() {
  node -e 'const c = require("crypto"); const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 16; i++) s += abc[c.randomInt(abc.length)]; console.log(s);'
}

with_db() {
  local base="${ATLAS%%\?*}" query=""
  if [[ "$ATLAS" == *\?* ]]; then
    query="?${ATLAS#*\?}"
  fi
  echo "${base%/}/$1$query"
}

for svc in $SERVICES; do
  if [ ! -f "$svc/.env" ]; then
    template_for "$svc" > "$svc/.env"
    echo "created $svc/.env"
  fi
done

INTERNAL_KEY=$(existing_value INTERNAL_KEY)
INTERNAL_KEY=${INTERNAL_KEY:-$(random_secret)}
JWT_SECRET=$(existing_value JWT_SECRET)
JWT_SECRET=${JWT_SECRET:-$(random_secret)}
ATLAS=""
atlas_asked=no

for svc in $SERVICES; do
  env_file="$svc/.env"

  for key in INTERNAL_KEY JWT_SECRET; do
    if needs_value "$env_file" "$key"; then
      set_value "$env_file" "$key" "${!key}"
      echo "set $key in $env_file"
    fi
  done

  if needs_value "$env_file" MONGO_URI; then
    if [ "$atlas_asked" = no ]; then
      atlas_asked=yes
      echo "Your Atlas connection string WITHOUT a database name,"
      echo "like: mongodb+srv://<db-user>:<db-password>@<cluster-host>"
      read -r -s -p "Paste it (hidden), or press Enter to skip for now: " ATLAS
      echo
      if [[ "$ATLAS" == *"<"* ]]; then
        echo "It still contains a <placeholder> (Atlas shows <db_password>). Put your real password in and run again."
        exit 1
      fi
      if [ -n "$ATLAS" ] && [[ "$ATLAS" != mongodb* ]]; then
        echo "That doesn't look like a MongoDB connection string. Run the script again."
        exit 1
      fi
    fi
    if [ -n "$ATLAS" ]; then
      db=$(database_for "$svc")
      set_value "$env_file" MONGO_URI "$(with_db "$db")"
      echo "set MONGO_URI in $env_file (database $db)"
    else
      echo "skipped MONGO_URI in $env_file"
    fi
  fi

  if needs_value "$env_file" ADMIN_PASSWORD; then
    read -r -s -p "Password for the first admin (6+ characters, hidden), or Enter to generate one: " ADMIN_PASSWORD
    echo
    if [ -z "$ADMIN_PASSWORD" ]; then
      ADMIN_PASSWORD=$(random_password)
      echo "generated a random admin password (it's in $env_file)"
    elif [ ${#ADMIN_PASSWORD} -lt 6 ] || [[ "$ADMIN_PASSWORD" == *'$'* ]]; then
      echo "Use at least 6 characters and no \$ (compose reads \$ as a variable). Run the script again."
      exit 1
    fi
    set_value "$env_file" ADMIN_PASSWORD "$ADMIN_PASSWORD"
    echo "set ADMIN_PASSWORD in $env_file"
  fi
done

echo
db_missing=no
for svc in registration-service login-service equipment-service loan-service; do
  if needs_value "$svc/.env" MONGO_URI; then
    db_missing=yes
  fi
done
if [ "$db_missing" = yes ]; then
  echo "Almost done: MONGO_URI is still empty. Run ./scripts/setup-local-env.sh again"
  echo "and paste your Atlas connection string."
else
  echo "Every .env is complete. The first admin logs in with ADMIN_EMAIL and ADMIN_PASSWORD"
  echo "from registration-service/.env."
fi
