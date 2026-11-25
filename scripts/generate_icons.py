#!/usr/bin/env python3
"""
Generate multi-format icons (PNG, ICO) from the unified compass design
matching web/public/favicon.svg (pure transparent #000a38 without artificial backgrounds).
Outputs to web/public and server/cmd/nextnav/web.
"""
import os
import shutil
from PIL import Image, ImageDraw

def render_compass(size):
    """
    Renders the compass icon at high resolution (8x supersampling)
    with pure transparent background, downsampling with Lanczos filter.
    """
    scale = 8
    dim = size * scale
    img = Image.new('RGBA', (dim, dim), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s = dim / 512.0
    color = (0, 10, 56, 255) # #000a38

    cx = 256.0 * s
    cy = 256.0 * s
    r_out = 192.0 * s
    r_in = 144.0 * s

    # 1. Ring
    draw.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=color)
    draw.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=(0, 0, 0, 0))

    def tx(pts):
        return [(x * s, y * s) for x, y in pts]

    # 2. Four directional triangles
    triangles = [
        [(256, 28), (232, 74), (280, 74)],
        [(256, 484), (232, 438), (280, 438)],
        [(28, 256), (74, 232), (74, 280)],
        [(484, 256), (438, 232), (438, 280)]
    ]
    tri_stroke = max(1, int(6.0 * s))
    for tri in triangles:
        pts = tx(tri)
        draw.polygon(pts, fill=color, outline=color, width=tri_stroke)
        for px, py in pts:
            rad = tri_stroke / 2.0
            draw.ellipse([px - rad, py - rad, px + rad, py + rad], fill=color)

    # 3. Center needle
    needle = [(348, 164), (144, 258), (236, 276), (254, 368)]
    needle_stroke = max(1, int(10.0 * s))
    pts = tx(needle)
    draw.polygon(pts, fill=color, outline=color, width=needle_stroke)
    for px, py in pts:
        rad = needle_stroke / 2.0
        draw.ellipse([px - rad, py - rad, px + rad, py + rad], fill=color)

    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    web_public = os.path.join(root, 'web', 'public')
    server_web = os.path.join(root, 'server', 'cmd', 'nextnav', 'web')

    os.makedirs(web_public, exist_ok=True)
    os.makedirs(server_web, exist_ok=True)

    print("Generating pure transparent icons from favicon.svg...")

    # 1. 512x512 PNG
    img_512 = render_compass(512)
    path_512 = os.path.join(web_public, 'nextnav-512x512.png')
    img_512.save(path_512, format='PNG')

    # 2. 192x192 PNG
    img_192 = render_compass(192)
    path_192 = os.path.join(web_public, 'nextnav-192x192.png')
    img_192.save(path_192, format='PNG')

    # 3. 32x32 PNG
    img_32 = render_compass(32)
    path_32 = os.path.join(web_public, 'favicon-32x32.png')
    img_32.save(path_32, format='PNG')

    # 4. Apple Touch Icon (180x180)
    img_apple = render_compass(180)
    path_apple = os.path.join(web_public, 'apple-touch-icon.png')
    img_apple.save(path_apple, format='PNG')

    # 5. Multi-size favicon.ico (16, 32, 48)
    ico_16 = render_compass(16)
    ico_32 = render_compass(32)
    ico_48 = render_compass(48)
    path_ico = os.path.join(web_public, 'favicon.ico')
    ico_48.save(path_ico, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[ico_16, ico_32])

    # Copy all generated files + favicon.svg into server/cmd/nextnav/web
    files_to_sync = [
        'favicon.svg',
        'favicon.ico',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'nextnav-192x192.png',
        'nextnav-512x512.png'
    ]

    for fname in files_to_sync:
        src = os.path.join(web_public, fname)
        dst = os.path.join(server_web, fname)
        if os.path.exists(src):
            shutil.copy2(src, dst)

    print("All icons successfully generated and synchronized without artificial backgrounds!")

if __name__ == '__main__':
    main()
