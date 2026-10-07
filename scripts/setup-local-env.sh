#!/usr/bin/env bash
# Creates or completes each service's .env for running locally (with node or docker compose).
#   1. A missing .env is copied from its .env.example.
#   2. Every value that is still a <placeholder> is filled in:
#      - INTERNAL_KEY and JWT_SECRET: generated once and shared, so every service matches
#      - MONGO_URI: from your Atlas connection string (hidden as you type), with the right
#        database name added for each service. Press Enter to skip it and run again later.
#      - ADMIN_PASSWORD: the first admin's password (hidden). Press Enter to generate one.
# Values that are already filled in are never changed, so it's safe to run again.
# Run from anywhere:  ./scripts/setup-local-env.sh
set -euo pipefail
cd "$(dirname "$0")/.." # the repo root

SERVICES="gateway registration-service login-service equipment-service loan-service"

# The database each service uses (the gateway has none)
database_for() { # database_for <service>
  case $1 in
    registration-service | login-service) echo userdb ;;
    equipment-service) echo equipmentdb ;;
    loan-service) echo loandb ;;
  esac
}

# True when the file has a KEY=... line whose value is still empty or a <placeholder>
needs_value() { # needs_value <file> <KEY>
  local line value
  line=$(grep -m1 "^$2=" "$1" || true)
  [ -n "$line" ] || return 1
  value=${line#*=}
  [ -z "$value" ] || [[ "$value" == *"<"* ]]
}

# A real value from any existing .env, so a shared secret stays the same in every service
existing_value() { # existing_value <KEY>
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

random_secret() { node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'; }

# 16 letters and digits: no symbols, so nothing needs escaping in .env or compose
random_password() {
  node -e 'const c = require("crypto"); const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 16; i++) s += abc[c.randomInt(abc.length)]; console.log(s);'
}

# "<connection string>/<database>", keeping any ?options at the end
with_db() { # with_db <database>
  local base="${ATLAS%%\?*}" query=""
  if [[ "$ATLAS" == *\?* ]]; then
    query="?${ATLAS#*\?}"
  fi
  echo "${base%/}/$1$query"
}

# 1. Copy any missing .env from its .env.example
for svc in $SERVICES; do
  if [ ! -f "$svc/.env" ]; then
    cp "$svc/.env.example" "$svc/.env"
    echo "created $svc/.env"
  fi
done

# 2. Fill in whatever is still a placeholder
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
      set_value "$env_file" "$key" "${!key}" # ${!key} = the value of the variable named in $key
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
if grep -q '^MONGO_URI=.*<' registration-service/.env login-service/.env equipment-service/.env loan-service/.env; then
  echo "Almost done: MONGO_URI is still a placeholder. Run ./scripts/setup-local-env.sh again"
  echo "and paste your Atlas connection string."
else
  echo "Every .env is complete. The first admin logs in with ADMIN_EMAIL and ADMIN_PASSWORD"
  echo "from registration-service/.env."
fi
