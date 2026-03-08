#!/bin/bash

set -euo pipefail

echo "Seeding production database..."
export DIRECT_URL=$(doppler --config prd secrets get DIRECT_URL --plain)
pnpm prisma db push --url "$DIRECT_URL"

echo "Done."
