#!/usr/bin/env python3
"""Rebuild the flipbook pages from a new PDF. The website address and QR code stay the same.

Usage (from the repository folder):
    python3 tools/build_pages.py path/to/new.pdf

Needs: Python 3.9+, poppler-utils (pdftoppm), and  pip install pillow pymupdf
Then commit and push the changes; GitHub Pages updates in about a minute.
"""
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZES = {"2480": (2480, 3508), "1240": (1240, 1754), "thumb": (240, 340)}
PDF_NAME = "ibagiw-2026.pdf"


def fit_on_page(img, size):
    """Scale a rendered page onto an A4 canvas without distorting it."""
    w, h = size
    s = min(w / img.width, h / img.height)
    nw, nh = round(img.width * s), round(img.height * s)
    page = Image.new("RGB", size, "white")
    page.paste(img.resize((nw, nh), Image.LANCZOS), ((w - nw) // 2, (h - nh) // 2))
    return page


def save_pair(img, base, q):
    img.save(base + ".webp", "WEBP", quality=q, method=6)
    img.save(base + ".jpg", "JPEG", quality=q, optimize=True, progressive=True, subsampling=2)


def main():
    if len(sys.argv) != 2 or not os.path.isfile(sys.argv[1]):
        sys.exit(__doc__)
    src = os.path.abspath(sys.argv[1])
    if shutil.which("pdftoppm") is None:
        sys.exit("pdftoppm not found: install poppler-utils first.")
    import pymupdf  # noqa: E402  (checked here so the error message is clear)

    tmp = tempfile.mkdtemp(prefix="flipbook-")
    try:
        subprocess.run(["pdftoppm", "-r", "300", "-png", src, os.path.join(tmp, "p")], check=True)
        renders = sorted(glob.glob(os.path.join(tmp, "p-*.png")),
                         key=lambda f: int(re.search(r"-(\d+)\.png$", f).group(1)))
        if not renders:
            sys.exit("No pages were rendered from the PDF.")
        count = len(renders)

        for d in SIZES:
            folder = os.path.join(ROOT, "pages", d)
            os.makedirs(folder, exist_ok=True)
            for old in glob.glob(os.path.join(folder, "page-*")):
                os.remove(old)

        for i, f in enumerate(renders, start=1):
            name = f"page-{i:02d}"
            hd = fit_on_page(Image.open(f).convert("RGB"), SIZES["2480"])
            save_pair(hd, os.path.join(ROOT, "pages", "2480", name), 82)
            std = hd.resize(SIZES["1240"], Image.LANCZOS)
            save_pair(std, os.path.join(ROOT, "pages", "1240", name), 82)
            save_pair(std.resize(SIZES["thumb"], Image.LANCZOS), os.path.join(ROOT, "pages", "thumb", name), 80)
            print(f"page {i}/{count}")

        # lighter download copy of the PDF (text stays selectable)
        doc = pymupdf.open(src)
        doc.rewrite_images(dpi_threshold=210, dpi_target=200, quality=80)
        out_pdf = os.path.join(ROOT, PDF_NAME)
        doc.save(out_pdf, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True)
        mb = max(1, round(os.path.getsize(out_pdf) / 1048576))

        index = os.path.join(ROOT, "index.html")
        html = open(index, encoding="utf-8").read()
        html = re.sub(r'data-pages="\d+"', f'data-pages="{count}"', html)
        html = re.sub(r'id="pageLabel" aria-live="polite">[^<]*<', f'id="pageLabel" aria-live="polite">1 / {count}<', html)
        html = re.sub(r"Download PDF \(\d+ MB\)", f"Download PDF ({mb} MB)", html)
        open(index, "w", encoding="utf-8").write(html)
        print(f"Done: {count} pages, PDF {mb} MB. Commit and push to publish.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
