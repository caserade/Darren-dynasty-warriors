"""Pack generated painted alpha components into stable-foot, padded game atlases."""

from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_dilation
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/firewood'
OUT = ROOT / 'dist/assets'


def extract(path, count, cols, rows):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    labels, n = label(a[:, :, 3] > 20)
    counts = np.bincount(labels.ravel())
    ids = [i for i in range(1, n + 1) if counts[i] > 500]
    assert len(ids) == count, (path, len(ids))
    entries = []
    for i in ids:
        ys, xs = np.where(labels == i)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        entries.append((i, box))
    # Place each component by row and horizontal order rather than equal crop rectangles.
    entries.sort(key=lambda e: (e[1][1] + e[1][3]) / 2)
    ordered = []
    for row in range(rows):
        ordered.extend(sorted(entries[row * cols : (row + 1) * cols], key=lambda e: e[1][0]))
    result = []
    anchors = {
        'tormund-front.png': [245, 700, 1130, 1548, 222, 650, 1145, 1535],
        'tormund-rear.png': [280, 685, 1090, 1575, 320, 720, 1140, 1550],
        'bucky-actions.png': [
            175,
            482,
            803,
            1120,
            175,
            490,
            804,
            1120,
            175,
            485,
            795,
            1120,
            180,
            490,
            804,
            1120,
        ],
    }.get(path.name)
    for ordinal, (i, box) in enumerate(ordered):
        x0, y0, x1, y1 = box
        mask = binary_dilation(labels == i, iterations=2)
        cut = a.copy()
        cut[:, :, 3] = np.where(mask, a[:, :, 3], 0)
        x0 = max(0, x0 - 2)
        y0 = max(0, y0 - 2)
        x1 = min(im.width, x1 + 2)
        y1 = min(im.height, y1 + 2)
        tile = Image.fromarray(cut[y0:y1, x0:x1])
        alpha = np.array(tile)[:, :, 3]
        ys, xs = np.where(alpha[int(tile.height * 0.88) :, :] > 80)
        anchor = anchors[ordinal] - x0 if anchors else tile.width / 2
        result.append((tile, anchor))
    return result


def pack(frames, path, props=False):
    size = 384 if props else 256
    cols = 2 if props else 4
    anchor_y = 330 if props else 224
    atlas = Image.new('RGBA', (size * cols, size * ((len(frames) + cols - 1) // cols)))
    scale = (
        min(
            208 / max(max(a, im.width - a) * 2 for im, a in frames),
            208 / max(im.height for im, a in frames),
        )
        if not props
        else None
    )
    for i, (im, anchor) in enumerate(frames):
        factor = scale if scale else min(344 / im.width, 310 / im.height)
        w, h = round(im.width * factor), round(im.height * factor)
        resized = im.resize((w, h), Image.Resampling.LANCZOS)
        x = round(size / 2 - anchor * factor) if not props else (size - w) // 2
        y = anchor_y - h
        assert x >= 2 and x + w < size - 1 and y >= 2, (i, x, w, y)
        atlas.alpha_composite(resized, ((i % cols) * size + x, (i // cols) * size + y))
    atlas.save(path, optimize=True)


pack(
    extract(SOURCE / 'tormund-front.png', 8, 4, 2) + extract(SOURCE / 'tormund-rear.png', 8, 4, 2),
    OUT / 'tormund-atlas.png',
)
pack(extract(SOURCE / 'bucky-actions.png', 16, 4, 4), OUT / 'bucky-atlas.png')
pack(extract(SOURCE / 'props.png', 4, 2, 2), OUT / 'firewood-atlas.png', True)
print('Packed 32 character poses and four props with stable feet and transparent padding.')
