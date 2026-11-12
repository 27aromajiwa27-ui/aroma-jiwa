"""Render PWA PNG icons (192/512 + apple-touch 180) without third-party libs.

Draws the same brand mark as app/icon.svg: diagonal navy-blue -> aqua gradient,
a white bottle silhouette and a navy seal with an aqua check.
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "icons")
SS = 3  # supersampling factor for anti-aliasing

STOPS = [(0.0, (30, 86, 200)), (0.55, (47, 107, 234)), (1.0, (94, 223, 176))]


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def gradient(t):
    t = max(0.0, min(1.0, t))
    for i in range(len(STOPS) - 1):
        p0, c0 = STOPS[i]
        p1, c1 = STOPS[i + 1]
        if t <= p1:
            return lerp(c0, c1, (t - p0) / (p1 - p0))
    return STOPS[-1][1]


def in_round_rect(x, y, w, h, r):
    if x < 0 or y < 0 or x > w or y > h:
        return False
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    ln = dx * dx + dy * dy
    t = 0.0 if ln == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ln))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy)


def in_triangle(px, py, ax, ay, bx, by, cx, cy):
    d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
    d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
    d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def render(size):
    w = size * SS
    px = bytearray(w * w * 4)
    radius = 0.226 * w
    cx, cy = 0.5 * w, 0.555 * w          # bottle centre
    body_r = 0.172 * w                    # bottle body radius
    neck_w = 0.055 * w
    cap_w = 0.098 * w
    cap_top = 0.180 * w
    cap_bottom = 0.255 * w
    neck_top = 0.250 * w
    seal = (0.685 * w, 0.715 * w, 0.100 * w)  # seal cx, cy, r

    for y in range(w):
        for x in range(w):
            i = (y * w + x) * 4
            if not in_round_rect(x, y, w, h=w, r=radius):
                px[i:i + 4] = b"\x00\x00\x00\x00"
                continue
            t = (x / w + y / w) / 2.0
            r, g, b = gradient(t)
            # soft light blobs from the SVG
            d1 = math.hypot(x - 0.765 * w, y - 0.235 * w)
            d2 = math.hypot(x - 0.19 * w, y - 0.80 * w)
            glow = 0.0
            if d1 < 0.19 * w:
                glow += 0.12 * (1 - d1 / (0.19 * w))
            if d2 < 0.23 * w:
                glow += 0.08 * (1 - d2 / (0.23 * w))
            if glow:
                r = int(r + (255 - r) * glow)
                g = int(g + (255 - g) * glow)
                b = int(b + (255 - b) * glow)

            # bottle: cap (rounded bar) + neck + body (circle + shoulders)
            in_bottle = False
            if in_round_rect(x - (cx - cap_w), y - cap_top, 2 * cap_w, cap_bottom - cap_top, 0.026 * w):
                in_bottle = True
            if abs(x - cx) <= neck_w and neck_top <= y <= cy - 0.06 * w:
                in_bottle = True
            if (x - cx) ** 2 + (y - cy) ** 2 <= body_r ** 2:
                in_bottle = True
            if in_triangle(x, y, cx - body_r, cy,
                           cx - neck_w, cy - 0.30 * w, cx + neck_w, cy - 0.30 * w):
                in_bottle = True
            if in_triangle(x, y, cx + body_r, cy,
                           cx - neck_w, cy - 0.30 * w, cx + neck_w, cy - 0.30 * w):
                in_bottle = True
            if in_bottle:
                fade = 0.80 + 0.15 * (1 - (y - neck_top) / (cy + body_r - neck_top))
                r = int(r + (255 - r) * fade)
                g = int(g + (255 - g) * fade)
                b = int(b + (255 - b) * fade)

            # navy seal + aqua check
            sdist = math.hypot(x - seal[0], y - seal[1])
            if sdist <= seal[2]:
                r, g, b = 11, 42, 91
                c1 = seg_dist(x, y, seal[0] - 0.042 * w, seal[1] + 0.001 * w,
                              seal[0] - 0.010 * w, seal[1] + 0.034 * w)
                c2 = seg_dist(x, y, seal[0] - 0.010 * w, seal[1] + 0.034 * w,
                              seal[0] + 0.042 * w, seal[1] - 0.030 * w)
                if min(c1, c2) <= 0.020 * w:
                    r, g, b = 94, 223, 176

            px[i] = r
            px[i + 1] = g
            px[i + 2] = b
            px[i + 3] = 255

    # box downsample
    out = bytearray(size * size * 4)
    n = SS * SS
    for y in range(size):
        for x in range(size):
            acc = [0, 0, 0, 0]
            for dy in range(SS):
                for dx in range(SS):
                    j = ((y * SS + dy) * w + (x * SS + dx)) * 4
                    for k in range(4):
                        acc[k] += px[j + k]
            o = (y * size + x) * 4
            for k in range(4):
                out[o + k] = acc[k] // n
    return bytes(out)


def write_png(path, size, raw):
    stride = size * 4
    lines = b"".join(b"\x00" + raw[y * stride:(y + 1) * stride] for y in range(size))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
           chunk(b"IDAT", zlib.compress(lines, 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)
    print("wrote", path, len(png), "bytes")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (192, 512):
        write_png(os.path.join(OUT, "icon-%d.png" % s), s, render(s))
    write_png(os.path.join(OUT, "apple-touch-icon.png"), 180, render(180))
