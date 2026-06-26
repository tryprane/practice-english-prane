"""Generate PWA icons for the Practice English Prane app."""
import os
from PIL import Image, ImageDraw

TOP = (108, 142, 239)      # #6c8eef brand accent
BOTTOM = (63, 85, 196)     # deeper indigo for gradient
WHITE = (255, 255, 255)
ACCENT = (108, 142, 239)

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
ROOT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')


def gradient(size, top=TOP, bottom=BOTTOM):
    """Vertical gradient image."""
    img = Image.new('RGB', (size, size), top)
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img


def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_bubble(base, size, scale=0.62):
    """Draw a white speech bubble with three dots centered on base."""
    d = ImageDraw.Draw(base, 'RGBA')
    s = size
    bw = int(s * scale)            # bubble width
    bh = int(s * scale * 0.80)     # bubble height
    cx = s // 2
    cy = int(s * 0.45)
    x0 = cx - bw // 2
    y0 = cy - bh // 2
    x1 = x0 + bw
    y1 = y0 + bh
    radius = int(bh * 0.28)

    # tail (triangle) bottom-left
    tail = [
        (x0 + int(bw * 0.06), y1 - int(bh * 0.02)),
        (x0 + int(bw * 0.34), y1 - int(bh * 0.02)),
        (x0 - int(bw * 0.06), y1 + int(bh * 0.20)),
    ]
    d.polygon(tail, fill=WHITE + (255,))

    d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=WHITE + (255,))

    # three dots
    dot_r = int(bh * 0.075)
    gap = int(bw * 0.18)
    dy = int(bh * 0.08)
    for i in range(3):
        dx = (i - 1) * gap
        cx_d = cx + dx
        cy_d = int(y0 + bh * 0.42) + dy
        d.ellipse([cx_d - dot_r, cy_d - dot_r, cx_d + dot_r, cy_d + dot_r],
                  fill=ACCENT + (255,))


def make_icon(size, purpose, out_name):
    base = gradient(size)
    if purpose == 'maskable':
        # full-bleed square; content smaller (safe zone)
        draw_bubble(base, size, scale=0.52)
        img = base
    else:
        draw_bubble(base, size, scale=0.64)
        radius = int(size * 0.22)
        mask = rounded_mask(size, radius)
        rounded = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        rounded.paste(base, (0, 0), mask)
        img = rounded
    path = os.path.join(OUT_DIR, out_name)
    img.save(path, 'PNG')
    print('wrote', out_name, size)


def make_apple(size, out_name):
    # Apple touch icon: solid bg (no transparency, no rounding)
    base = gradient(size)
    draw_bubble(base, size, scale=0.64)
    base.save(os.path.join(OUT_DIR, out_name), 'PNG')
    print('wrote', out_name, size)


def make_favicon(size, out_name):
    base = gradient(size)
    draw_bubble(base, size, scale=0.66)
    radius = max(2, int(size * 0.22))
    mask = rounded_mask(size, radius)
    rounded = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    rounded.paste(base, (0, 0), mask)
    rounded.save(os.path.join(OUT_DIR, out_name), 'PNG')
    print('wrote', out_name, size)


def make_ico(sizes, out_name):
    frames = []
    for s in sizes:
        base = gradient(s)
        draw_bubble(base, s, scale=0.66)
        radius = max(2, int(s * 0.22))
        mask = rounded_mask(s, radius)
        rounded = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        rounded.paste(base, (0, 0), mask)
        frames.append(rounded)
    path = os.path.join(ROOT_DIR, out_name)
    frames[0].save(path, format='ICO', sizes=[(s, s) for s in sizes],
                   append_images=frames[1:])
    print('wrote', out_name, sizes)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    make_icon(192, 'any', 'icon-192.png')
    make_icon(512, 'any', 'icon-512.png')
    make_icon(192, 'maskable', 'icon-maskable-192.png')
    make_icon(512, 'maskable', 'icon-maskable-512.png')
    make_apple(180, 'apple-touch-icon.png')
    make_favicon(32, 'favicon-32.png')
    make_ico([16, 32, 48], 'favicon.ico')


if __name__ == '__main__':
    main()
