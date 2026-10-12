#!/bin/bash
# Mac launcher for the pixel game: double-click in Finder. Uses Node.js if installed, otherwise Python 3.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if command -v node >/dev/null 2>&1; then
  exec node desktop-server.cjs --pixel
fi
if command -v python3 >/dev/null 2>&1 && python3 -c 'import http.server' >/dev/null 2>&1; then
  exec python3 desktop-server.py --pixel
fi
echo "Install Node.js LTS (nodejs.org) or Python 3 (python.org), then open this launcher again."
read -r -p "Press Return to close this window."
