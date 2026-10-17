#!/bin/zsh
# Double-click to run the raffle on this Mac, fully offline: makes sure the
# database is up, starts the app server if it is not already running, and
# opens the Control Center in Google Chrome. Leave this window open while
# the event runs (closing it stops the server).
cd "$(dirname "$0")"

echo "NATCON Raffle — starting up…"

# The database (MySQL from Homebrew). Starting it when it already runs is harmless.
if ! pgrep -x mysqld >/dev/null; then
    echo "Starting MySQL…"
    brew services start mysql >/dev/null 2>&1 || /opt/homebrew/opt/mysql/bin/mysql.server start
    sleep 3
fi

# The app server, unless one is already serving.
if curl -s -o /dev/null -m 2 http://127.0.0.1:8000/; then
    echo "The app server is already running at http://127.0.0.1:8000"
    open -a "Google Chrome" "http://127.0.0.1:8000/raffles" 2>/dev/null || open "http://127.0.0.1:8000/raffles"
    echo "You can close this window."
    exit 0
fi

# Open the browser once the server answers.
( for i in {1..30}; do
      if curl -s -o /dev/null -m 1 http://127.0.0.1:8000/; then
          open -a "Google Chrome" "http://127.0.0.1:8000/raffles" 2>/dev/null || open "http://127.0.0.1:8000/raffles"
          break
      fi
      sleep 1
  done ) &

echo "Serving at http://127.0.0.1:8000 — keep this window open during the event."
exec php artisan serve --host=127.0.0.1 --port=8000
