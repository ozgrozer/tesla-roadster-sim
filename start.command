#!/bin/bash
# Double-click to play offline: starts a local web server and opens the game in your browser.
cd "$(dirname "$0")" || exit 1
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
if command -v node >/dev/null 2>&1; then
  exec node tools/serve.mjs --open
elif command -v python3 >/dev/null 2>&1; then
  (sleep 1 && open "http://localhost:8080") &
  exec python3 -m http.server 8080 --bind 127.0.0.1
else
  echo "Tesla Roadster Sim needs Node.js (https://nodejs.org) or Python 3 to run its local server."
  read -r -p "Press Return to close."
fi
