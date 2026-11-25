"""Contact sheet of hero renders (24 Nov): every PNG listed in <dir>/renders.json, as thumbnails on a white sheet, with
the file name under each (transparent layers shown over white; the mask and depth as they are).

    python -I tools/hero_contact_sheet.py <dir> <out.png> [--thumb 360] [--cols 6] [--match text]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    a = sys.argv[1:]
    folder, out = Path(a[0]), Path(a[1])
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    thumb, cols, match = int(opt('--thumb', '360')), int(opt('--cols', '6')), opt('--match', '')
    rows = json.loads((folder / 'renders.json').read_text(encoding='utf-8'))['renders']
    files = [r['file'] for r in rows if match in r['file'] and (folder / r['file']).exists()]
    cells = []
    for f in files:
        im = Image.open(folder / f).convert('RGBA')
        im.thumbnail((thumb, thumb * 2))
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        cells.append((f, bg.convert('RGB')))
    cell_h = max((c[1].height for c in cells), default=thumb) + 26
    n_rows = (len(cells) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (thumb + 16) + 16, n_rows * (cell_h + 12) + 16), (236, 238, 241))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(cells):
        x, y = 16 + (i % cols) * (thumb + 16), 16 + (i // cols) * (cell_h + 12)
        sheet.paste(im, (x, y))
        d.rectangle([x - 1, y - 1, x + im.width, y + im.height], outline=(200, 205, 212))
        d.text((x, y + im.height + 6), name[:60], fill=(32, 38, 48))
    sheet.save(out)
    print('contact sheet', out, len(cells), 'images')


if __name__ == '__main__':
    main()
