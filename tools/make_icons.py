#!/usr/bin/env python3
"""Draw the app icons: an amber seven-segment score on a screenRIG slate board."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
SLATE, BOARD, AMBER = (42, 53, 71), (9, 13, 19), (255, 179, 26)
mix = lambda a, b, t: tuple(round(x * (1 - t) + y * t) for x, y in zip(a, b))
SEG = {'0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg'}


def seg_polys(x0, y0, W, H):
    t, g = W * 0.19, W * 0.03
    def hz(y, x1, x2):
        return [(x1, y), (x1 + t / 2, y - t / 2), (x2 - t / 2, y - t / 2), (x2, y), (x2 - t / 2, y + t / 2), (x1 + t / 2, y + t / 2)]
    def vt(x, y1, y2):
        return [(x, y1), (x + t / 2, y1 + t / 2), (x + t / 2, y2 - t / 2), (x, y2), (x - t / 2, y2 - t / 2), (x - t / 2, y1 + t / 2)]
    p = {'a': hz(t / 2, t / 2 + g, W - t / 2 - g), 'g': hz(H / 2, t / 2 + g, W - t / 2 - g), 'd': hz(H - t / 2, t / 2 + g, W - t / 2 - g),
         'f': vt(t / 2, t / 2 + g, H / 2 - g), 'b': vt(W - t / 2, t / 2 + g, H / 2 - g), 'e': vt(t / 2, H / 2 + g, H - t / 2 - g), 'c': vt(W - t / 2, H / 2 + g, H - t / 2 - g)}
    skew = 0.08
    return {k: [(x0 + x + (H - y) * skew, y0 + y) for x, y in v] for k, v in p.items()}


def icon(size, content=0.78, radius=0.0, bg=SLATE):
    S = size * 4
    im = Image.new('RGBA', (S, S), bg + (255,))
    d = ImageDraw.Draw(im)
    bw, bh = S * content, S * content * 0.66
    bx, by = (S - bw) / 2, (S - bh) / 2
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=S * 0.06 * content, fill=BOARD)
    # amber underline like the band on the board
    d.rounded_rectangle([bx + bw * 0.1, by + bh * 0.84, bx + bw * 0.9, by + bh * 0.88], radius=S * 0.01, fill=mix(BOARD, AMBER, 0.35))
    dw, dh = bw * 0.27, bh * 0.62
    gap = bw * 0.07
    x = (S - (2 * dw + gap)) / 2
    y = by + bh * 0.13
    for ch in '21':
        polys = seg_polys(x, y, dw, dh)
        for k, poly in polys.items():
            on = k in SEG[ch]
            d.polygon(poly, fill=AMBER if on else mix(BOARD, AMBER, 0.13))
        x += dw + gap
    im = im.resize((size, size), Image.LANCZOS)
    if radius:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius), fill=255)
        im.putalpha(mask)
    return im


os.makedirs(OUT, exist_ok=True)
icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, content=0.62).save(os.path.join(OUT, 'maskable-512.png'))
icon(180).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
print('icons written')
