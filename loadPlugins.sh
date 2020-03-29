#!/bin/bash
# /usr/local/bin/npm cache clear

DIR="$(cd "$(dirname "$0")" && pwd)"

npm config set searchlimit 5000
/usr/bin/nodejs --max-old-space-size=3000 $DIR/getPlugins.js
