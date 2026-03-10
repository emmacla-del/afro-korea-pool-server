#!/bin/bash
# This script runs before your app starts
npx prisma migrate deploy
node dist/main.js
