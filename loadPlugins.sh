#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

OUTPUT=$(/usr/bin/nodejs --max-old-space-size=3000 $DIR/getPlugins.js)

if [ "${#OUTPUT}" -gt 1 ]; then
    echo "$OUTPUT" | ansi2html | mail -s "Etherpad Plugin Loader" -a "Content-Type: text/html; charset=UTF-8" stefan@stefans-entwicklerecke.de
fi
