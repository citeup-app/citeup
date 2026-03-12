#!/usr/bin/env bash
set -eo pipefail

# Clone production database to local development database
# Usage: ./scripts/clone.sh

# Load environment variables from Doppler and export POSTGRES_URL
#eval "$(doppler secrets download --format env --no-file)"

# Dump the database to a file
echo -e "\033[32m  Dumping database to backup.sql …\033[0m"
pg_dump "$POSTGRES_URL_NON_POOLING" --file prisma/backup.sql --schema public --clean --no-owner --no-privileges

# Restore the database from the file
echo -e "\033[32m  Restoring database from backup.sql …\033[0m"
psql postgresql://postgres:postgres@localhost:5432/citeup_dev < prisma/backup.sql

# Open the auth page
echo -e "\033[32m  Opening dashboard …\033[0m"
open "http://localhost:5173/"