#!/bin/sh
# Bundle un script d'audit pour Node : leva, React et R3F remplacés par des stubs.
cd "$(dirname "$0")/.."
npx esbuild ".sim/$1.ts" --bundle --platform=node --format=esm --outfile="/tmp/hairsim/$1.mjs" \
  --alias:leva=./.sim/stub/leva.ts \
  --alias:react=./.sim/stub/react.ts \
  --alias:react/jsx-runtime=./.sim/stub/react.ts \
  --alias:@react-three/fiber=./.sim/stub/fiber.ts \
  --alias:@react-three/drei=./.sim/stub/fiber.ts \
  --define:import.meta.env.DEV=false \
  --log-level=warning
