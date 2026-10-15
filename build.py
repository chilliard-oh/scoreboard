#!/usr/bin/env python3
"""Build screenRIG Scoreboard.

dist/pwa/       installable PWA for any static host (separate, readable files)
dist/artifact/  single self-contained page for the Claude-hosted preview
"""
import base64, hashlib, json, os, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
APP_URL = sys.argv[1] if len(sys.argv) > 1 else ''

FONTS = [
    ('Big Shoulders Display', 700, 'big-shoulders-display-latin-700-normal.woff2'),
    ('Big Shoulders Display', 800, 'big-shoulders-display-latin-800-normal.woff2'),
    ('Barlow', 400, 'barlow-latin-400-normal.woff2'),
    ('Barlow', 500, 'barlow-latin-500-normal.woff2'),
    ('Barlow', 600, 'barlow-latin-600-normal.woff2'),
    ('Barlow', 700, 'barlow-latin-700-normal.woff2'),
    ('Barlow Condensed', 600, 'barlow-condensed-latin-600-normal.woff2'),
    ('Barlow Condensed', 700, 'barlow-condensed-latin-700-normal.woff2'),
    ('Oswald', 600, 'oswald-latin-600-normal.woff2'),
    ('Saira Condensed', 700, 'saira-condensed-latin-700-normal.woff2'),
    ('IBM Plex Mono', 500, 'ibm-plex-mono-latin-500-normal.woff2'),
]
QR_CDN = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


def write(p, s, mode='w'):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, mode, encoding=None if 'b' in mode else 'utf-8') as f:
        f.write(s)


def font_css(inline):
    out = []
    for fam, wt, fn in FONTS:
        if inline:
            with open(os.path.join(ROOT, 'fonts', fn), 'rb') as f:
                src = 'url(data:font/woff2;base64,' + base64.b64encode(f.read()).decode() + ") format('woff2')"
        else:
            src = "url(fonts/" + fn + ") format('woff2')"
        out.append("@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;src:%s}" % (fam, wt, src))
    return '\n'.join(out)


css = read('src/app.css')
engine = read('src/engine.js')
sync = read('src/sync.js')
app = read('src/app.js')
app_art = app.replace("'__APP_URL__'.indexOf('__') === 0 ? '' : '__APP_URL__'", json.dumps(APP_URL)) if APP_URL else app

shutil.rmtree(DIST, ignore_errors=True)

# ------------------------------------------------------------------ PWA
pwa = os.path.join(DIST, 'pwa')
write(os.path.join(pwa, 'app.css'), css.replace('/*FONTS*/', font_css(False)))
write(os.path.join(pwa, 'engine.js'), engine)
write(os.path.join(pwa, 'sync.js'), sync)
write(os.path.join(pwa, 'app.js'), app)
for fam, wt, fn in FONTS:
    os.makedirs(os.path.join(pwa, 'fonts'), exist_ok=True)
    shutil.copy(os.path.join(ROOT, 'fonts', fn), os.path.join(pwa, 'fonts', fn))
os.makedirs(os.path.join(pwa, 'vendor'), exist_ok=True)
shutil.copy(os.path.join(ROOT, 'vendor', 'qrcode.js'), os.path.join(pwa, 'vendor', 'qrcode.js'))
shutil.copy(os.path.join(ROOT, 'vendor', 'peerjs.min.js'), os.path.join(pwa, 'vendor', 'peerjs.min.js'))
shutil.copytree(os.path.join(ROOT, 'icons'), os.path.join(pwa, 'icons'))

index = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>screenRIG Scoreboard</title>
<meta name="description" content="Multi-sport scoreboard for screenRIG displays. Run the game from a phone or tablet; show it on any screen shape.">
<meta name="theme-color" content="#2a3547">
<meta name="color-scheme" content="light dark">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Scoreboard">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}</style>
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="app"></div>
<noscript><p style="padding:24px;font:16px system-ui">screenRIG Scoreboard needs JavaScript.</p></noscript>
<script src="vendor/qrcode.js"></script>
<script src="engine.js"></script>
<script src="sync.js"></script>
<script src="app.js"></script>
</body>
</html>
"""
write(os.path.join(pwa, 'index.html'), index)

manifest = {
    "name": "screenRIG Scoreboard",
    "short_name": "Scoreboard",
    "description": "Multi-sport scoreboard for screenRIG displays. Run the game from a phone or tablet; show it on any screen shape.",
    "id": "./",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#0a0f16",
    "theme_color": "#2a3547",
    "categories": ["sports", "productivity", "utilities"],
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
write(os.path.join(pwa, 'manifest.webmanifest'), json.dumps(manifest, indent=2))

assets = ['./', 'index.html', 'app.css', 'engine.js', 'sync.js', 'app.js', 'manifest.webmanifest', 'vendor/qrcode.js', 'vendor/peerjs.min.js',
          'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'] + ['fonts/' + f for _, _, f in FONTS]
h = hashlib.sha256()
for a in assets[1:]:
    with open(os.path.join(pwa, a), 'rb') as f:
        h.update(f.read())
version = h.hexdigest()[:10]
sw = """/* screenRIG Scoreboard service worker: offline app shell. */
const CACHE = 'sb-%s';
const ASSETS = %s;
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;
  if (r.mode === 'navigate') {
    // Network first so updates arrive, but never make a display wait on bad Wi-Fi.
    e.respondWith(timeout(fetch(r), 3500).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); }
      return res;
    }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  })));
});
""" % (version, json.dumps(assets))
write(os.path.join(pwa, 'sw.js'), sw)
shutil.copy(os.path.join(ROOT, 'README.md'), os.path.join(pwa, 'README.md'))

# ------------------------------------------------------------- artifact
art = ('<title>screenRIG Scoreboard</title>\n'
       '<meta name="claude:viewport-fit-sides" content="cover">\n'
       '<meta name="theme-color" content="#2a3547">\n'
       '<style>\n' + css.replace('/*FONTS*/', font_css(True)) + '\n</style>\n'
       '<div id="app"></div>\n'
       '<script src="' + QR_CDN + '"></script>\n'
       '<script>\n' + engine + '\n</script>\n'
       '<script>\n' + sync + '\n</script>\n'
       '<script>\n' + app_art + '\n</script>\n')
write(os.path.join(DIST, 'artifact', 'index.html'), art)

print('built', version, 'pwa files:', sum(len(fs) for _, _, fs in os.walk(pwa)), 'artifact bytes:', len(art.encode()))
