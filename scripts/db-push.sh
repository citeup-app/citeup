#!/bin/bash

set -euo pipefail

# Fetch environment variables from Vercel and load them into the environment
vercel env pull --environment production > /dev/null
source .env.vercel

echo "Updating production database..."
pnpm prisma db push

echo "Done."
