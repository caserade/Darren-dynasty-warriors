"""Local server for both Darren games, used when Node.js is not installed."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
import sys
import webbrowser

root = Path(__file__).resolve().parent / 'dist'
start = '' if '--pixel' in sys.argv else '3d/'
SimpleHTTPRequestHandler.extensions_map.update(
    {'.mjs': 'text/javascript', '.glb': 'model/gltf-binary'}
)


def already_serving_game(port):
    """True when this game already runs on the port (another launcher was opened first)."""
    try:
        with urlopen(f'http://127.0.0.1:{port}/shared-save.js', timeout=1.5) as r:
            return r.status == 200 and b'SnowdayShared' in r.read()
    except OSError:
        return False


def open_game(port):
    url = f'http://127.0.0.1:{port}/{start}'
    print(f'Darren game: {url}\nKeep this window open. Ctrl+C stops the game server.', flush=True)
    webbrowser.open(url)


# Both games keep their saves in the browser storage of one address, so reuse a running copy
# instead of starting a second one on a new port.
for port in range(8000, 8021):
    try:
        server = ThreadingHTTPServer(
            ('127.0.0.1', port), partial(SimpleHTTPRequestHandler, directory=str(root))
        )
        break
    except OSError:
        if already_serving_game(port):
            open_game(port)
            print('(The game was already running in another window.)')
            sys.exit(0)
else:
    raise SystemExit('No available local port from 8000 to 8020.')

open_game(port)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
