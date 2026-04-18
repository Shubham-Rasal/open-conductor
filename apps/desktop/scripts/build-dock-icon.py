#!/usr/bin/env python3
"""Build resources/icon-dock.png from resources/icon.png.

When using app.dock.setIcon() on macOS, Electron draws a flat bitmap (no system
squircle). Applying a rounded-rect alpha mask makes the tile match other Dock
icons. Regenerate after changing icon.png (e.g. pnpm run sync-icon)."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> None:
    try:
        from PIL import Image, ImageChops, ImageDraw
    except ImportError:
        print("Missing Pillow: pip install pillow", file=sys.stderr)
        sys.exit(1)

    root = Path(__file__).resolve().parent.parent
    src = root / "resources" / "icon.png"
    dst = root / "resources" / "icon-dock.png"
    if not src.is_file():
        print(f"Not found: {src}", file=sys.stderr)
        sys.exit(1)

    im = Image.open(src).convert("RGBA")
    w, h = im.size
    radius = int(round(min(w, h) * 0.2237))
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    r, g, b, a = im.split()
    a = ImageChops.multiply(a, mask)
    out = Image.merge("RGBA", (r, g, b, a))
    out.save(dst, "PNG")
    print(f"Wrote {dst}")


if __name__ == "__main__":
    main()
