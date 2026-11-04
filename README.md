# IBAGIW 2026 · Flipbook

Online flipbook of the 9th Ibagiw Creative Festival media kit, invitation and programme (22 pages), published free with GitHub Pages.

**Live:** https://lexousjellicomarc.github.io/ibagiw2026/

## What's in it

- Turn pages by swiping, tapping, clicking, or with the arrow keys
- One page at a time on phones, two-page spreads on wider screens
- **Zoom** opens a sharp 300-DPI copy of each page (pinch, double-tap, or scroll to zoom)
- **Pages** lists every page to jump straight to one
- **Download** gives a lighter 7 MB copy of the PDF (the original was 40 MB)
- Page links: add `#p=10` to the address to open on page 10

## Updating the content (the QR code stays the same)

```bash
pip install pillow pymupdf          # plus poppler-utils for pdftoppm
python3 tools/build_pages.py path/to/new.pdf
git add -A && git commit -m "Update programme"
git push origin main main:gh-pages  # the live site is published from the gh-pages branch
```

GitHub Pages republishes within a minute or two, and anyone who scans the QR code sees the new version.

## Credits

Built with [StPageFlip](https://github.com/Nodlik/StPageFlip) and [PhotoSwipe](https://photoswipe.com), both MIT licensed (see `assets/vendor/`).
