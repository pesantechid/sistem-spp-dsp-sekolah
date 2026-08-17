#!/bin/sh
set -e

mkdir -p ./storage

npx prisma migrate deploy
npm run seed

exec "$@"
