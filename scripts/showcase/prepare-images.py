#!/usr/bin/env python3
"""Builds the showcase's images and property data from the demo folder.

    python3 scripts/showcase/prepare-images.py [demo dir]     (default: ~/StudentX-showcase-demo)

The demo (sx-demo-template.html + build.py, v20) is the visual spec. Its photos and
the property board's readback live OUTSIDE the repo on purpose (127 MB, and ESLint
would crawl it), so this script is the one bridge: it reads them and writes

    public/showcase/skyline.webp                 the homepage hero photo
    public/showcase/kitchen-before.webp          the homepage before/after pair,
    public/showcase/kitchen-after.webp           pre-aligned by kitchen/make_pair.py
    public/showcase/michael.webp                 the press-kit founder photo
    public/showcase/p/<num>/<nn>.webp            each property photo shown (1600 px)
    public/showcase/p/<num>/<nn>-t.webp          and its thumbnail (480 px)
    src/lib/showcase/properties.generated.json   facts + gallery order + image sizes

next.config.mjs sets images.unoptimized, so nothing resizes at request time: the sizes
written here are the sizes served. Rerun after the board changes, or after rerunning
kitchen/make_pair.py with the phone originals. Copy (the stories) is NOT written here:
it lives in src/messages/en.json like every other string.
"""
import glob
import json
import os
import pathlib
import sys

from PIL import Image

REPO = pathlib.Path(__file__).resolve().parents[2]
DEMO = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/StudentX-showcase-demo'))
OUT = REPO / 'public' / 'showcase'
DATA = REPO / 'src' / 'lib' / 'showcase' / 'properties.generated.json'

# The three live flats stand in for properties 101-103 (founder's naming, 2026-11-22).
NUM = {'0106001': '101', '0106002': '102', '0106003': '103'}
COUNT = {'101': 23, '102': 12, '103': 13}
# 101's photo 7 is the new toilet, in place of the live listing's old one (demo + board only).
SWAP = {('101', 7): DEMO / 'new' / '0106001_07_new.webp'}
FULL, THUMB = 1600, 480


def save(im, path, long_edge=None, quality=82):
    im = im.convert('RGB')
    if long_edge:
        im.thumbnail((long_edge, long_edge), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'WEBP', quality=quality, method=6)
    return im.size


def source(num, n):
    if (num, n) in SWAP:
        return SWAP[(num, n)]
    lid = {v: k for k, v in NUM.items()}[num]
    hits = glob.glob(str(DEMO / 'all' / f'{lid}_{n:02d}.*'))
    assert len(hits) == 1, (num, n, hits)
    return pathlib.Path(hits[0])


def main():
    board_dir = sorted(glob.glob(str(DEMO / 'readback*' / 'properties')))[-1]
    board = {}
    for f in sorted(glob.glob(board_dir + '/*.json')):
        d = json.load(open(f))
        board[d['num']] = d

    props = []
    for num in sorted(COUNT):
        b = board[num]
        lid = b['listingId']
        hidden = {int(h.replace(lid + '_', '')) for h in (b.get('hidden') or [])}
        shown = [n for n in range(1, COUNT[num] + 1) if n not in hidden]
        cover = int(str(b.get('cover') or '').replace(lid + '_', '') or 0)
        if cover not in shown:   # a hidden or missing cover falls back to the first photo shown
            cover = shown[0]
        order = [cover] + [n for n in shown if n != cover]   # the cover opens the gallery
        photos = []
        for n in order:
            im = Image.open(source(num, n))
            w, h = save(im, OUT / 'p' / num / f'{n:02d}.webp', FULL)
            tw, th = save(im, OUT / 'p' / num / f'{n:02d}-t.webp', THUMB, 74)
            photos.append({'src': f'/showcase/p/{num}/{n:02d}.webp', 'w': w, 'h': h,
                           'thumb': f'/showcase/p/{num}/{n:02d}-t.webp', 'tw': tw, 'th': th})
        props.append({
            'num': num, 'listingId': lid, 'show': b.get('show') is not False,
            'neighbourhood': b['neighbourhood'], 'size': b['size'], 'floor': b['floor'],
            'layout': b['layout'], 'auth': b['auth'], 'photos': photos,
        })
        print(num, 'shows', len(photos), 'photos, cover', f'{cover:02d}')

    # The MG² photo is 103-08, 103's bathroom, in all three places (his pick, demo v14).
    mg = Image.open(source('103', 8))
    mw, mh = save(mg, OUT / 'mg2.webp', 1920, 86)

    sw, sh = save(Image.open(DEMO / 'london' / 'skyline.webp'), OUT / 'skyline.webp', None, 86)
    kb = Image.open(DEMO / 'kitchen' / 'before-aligned.jpg')
    ka = Image.open(DEMO / 'kitchen' / 'after-aligned.jpg')
    assert kb.size == ka.size, (kb.size, ka.size)
    kw, kh = save(kb, OUT / 'kitchen-before.webp', None, 86)
    save(ka, OUT / 'kitchen-after.webp', None, 86)

    # The founder photo is a transparent avatar cut-out; the press kit shows it on the
    # soft grey (#f3f3f3) tile, so it is flattened onto that, as in the demo.
    face = Image.open(DEMO / 'repo' / 'michael.webp').convert('RGBA')
    bg = Image.new('RGBA', face.size, (243, 243, 243, 255))
    bg.alpha_composite(face)
    fw, fh = save(bg, OUT / 'michael.webp', None, 84)

    # The link-preview image: the white wordmark on black, from the repo's own
    # logo (public/logo-tesla-2048w.png, iris on transparent: only its alpha is
    # used). Not the skyline: its usage rights are unchecked.
    logo = Image.open(REPO / 'public' / 'logo-tesla-2048w.png').convert('RGBA')
    lw = 720
    logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    og = Image.new('RGB', (1200, 630), (0, 0, 0))
    og.paste(Image.new('RGB', logo.size, (255, 255, 255)), ((1200 - lw) // 2, (630 - logo.height) // 2), logo.getchannel('A'))
    og.save(REPO / 'public' / 'og-showcase.png', optimize=True)

    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps({
        '_generated': 'by scripts/showcase/prepare-images.py from the demo folder; do not edit by hand',
        'properties': props,
        'images': {
            'skyline': {'src': '/showcase/skyline.webp', 'w': sw, 'h': sh},
            'kitchenBefore': {'src': '/showcase/kitchen-before.webp', 'w': kw, 'h': kh},
            'kitchenAfter': {'src': '/showcase/kitchen-after.webp', 'w': kw, 'h': kh},
            'mg2': {'src': '/showcase/mg2.webp', 'w': mw, 'h': mh},
            'founder': {'src': '/showcase/michael.webp', 'w': fw, 'h': fh},
        },
    }, indent=2, ensure_ascii=False) + '\n')
    total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
    print('wrote', DATA.relative_to(REPO), '| public/showcase', round(total / 1e6, 1), 'MB')


if __name__ == '__main__':
    main()
