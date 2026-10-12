#!/usr/bin/env python3
"""Placeholder app icon (brief override 3): the design's edge-tab sun glyph (C-Glyphs, #FFD27A)
on color.bg #0B0E14. Pure Python (no dependencies) so it runs anywhere."""
import math, struct, zlib, sys

BG = (0x0B, 0x0E, 0x14)
SUN = (0xFF, 0xD2, 0x7A)

# Glyph in its 22-unit box centered at 0: disc r=5, rays 2 wide.
RAYS = [((0,-11),(0,-8)),((0,8),(0,11)),((-11,0),(-8,0)),((8,0),(11,0)),
        ((-7.8,-7.8),(-5.7,-5.7)),((5.7,5.7),(7.8,7.8)),((-7.8,7.8),(-5.7,5.7)),((5.7,-5.7),(7.8,-7.8))]

def seg_dist(px, py, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx-ax, by-ay
    t = max(0, min(1, ((px-ax)*dx + (py-ay)*dy) / (dx*dx+dy*dy)))
    return math.hypot(px-(ax+t*dx), py-(ay+t*dy))

def render(size, scale, bg_alpha):
    rows = []
    c = size / 2
    aa = 1 / scale  # one pixel in glyph units
    for y in range(size):
        row = bytearray([0])
        gy = (y + 0.5 - c) / scale
        for x in range(size):
            gx = (x + 0.5 - c) / scale
            d = math.hypot(gx, gy) - 5
            for a, b in RAYS:
                d = min(d, seg_dist(gx, gy, a, b) - 1)
            cov = max(0.0, min(1.0, 0.5 - d / aa))
            if bg_alpha:
                px = [round(BG[i] + (SUN[i]-BG[i]) * cov) for i in range(3)] + [255]
            else:
                px = list(SUN) + [round(255 * cov)]
            row += bytes(px)
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + \
        chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

out = sys.argv[1]
open(f'{out}/icon.png', 'wb').write(render(1024, 1024/22*0.62, True))
# Adaptive icon foreground: glyph inside the 66% safe zone, transparent background.
open(f'{out}/android-icon-foreground.png', 'wb').write(render(1024, 1024/22*0.42, False))
open(f'{out}/android-icon-monochrome.png', 'wb').write(render(1024, 1024/22*0.42, False))
# Splash: transparent image so the launch screen is plain #0B0E14 (Launch artboard).
def blank(size):
    raw = b''.join(b'\x00' + b'\x00\x00\x00\x00' * size for _ in range(size))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t+d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
open(f'{out}/splash-transparent.png', 'wb').write(blank(64))
print('ok')
