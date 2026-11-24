import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / 'src' / 'gfx' / 'surfaces.json'
STATS = ROOT / 'src' / 'gfx' / 'textureStats.json'
OUT = ROOT / 'public' / 'textures'
CACHE = ROOT / 'tools' / '.cache'
API = 'https://api.polyhaven.com/files/'
MAPS = {'albedo': 'Diffuse', 'normal': 'nor_gl', 'arm': 'arm'}
SIZES = {'1k': 1024, '512': 512}
QUALITY = {'albedo': 82, 'normal': 88, 'arm': 80}
HEADERS = {'User-Agent': 'Reticula-texture-tool/1.0'}


def fetch(url, dest):
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    tmp = dest.with_suffix('.part')
    tmp.write_bytes(data)
    tmp.replace(dest)
    return dest


def srgb_to_linear(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mean_linear(img):
    small = img.convert('RGB').resize((64, 64), Image.BILINEAR)
    lut = [srgb_to_linear(float(i)) for i in range(256)]
    raw = small.tobytes()
    n = len(raw) // 3
    return [round(sum(lut[raw[i]] for i in range(k, len(raw), 3)) / n, 5) for k in range(3)]


def process(key, entry, force):
    asset = entry['asset']
    files = json.loads(urllib.request.urlopen(urllib.request.Request(API + asset, headers=HEADERS), timeout=60).read())
    def get(ph):
        url = files[ph]['1k']['jpg']['url']
        return Image.open(fetch(url, CACHE / asset / Path(url).name))

    images = {name: get(ph) for name, ph in MAPS.items() if ph in files}
    if 'arm' not in images:
        rough = get('Rough').convert('L')
        ao = get('AO').convert('L').resize(rough.size) if 'AO' in files else Image.new('L', rough.size, 255)
        images['arm'] = Image.merge('RGB', (ao, rough, Image.new('L', rough.size, 0)))
    if entry.get('gray'):
        images['albedo'] = images['albedo'].convert('L').convert('RGB')
    if entry.get('contrast'):
        images['albedo'] = ImageEnhance.Contrast(images['albedo'].convert('RGB')).enhance(entry['contrast'])
    for size_key, px in SIZES.items():
        for name, img in images.items():
            dest = OUT / key / size_key / f'{name}.webp'
            if dest.exists() and not force:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            im = img.convert('RGB')
            if im.size != (px, px):
                im = im.resize((px, px), Image.LANCZOS)
            im.save(dest, 'WEBP', quality=QUALITY[name], method=6)
    return {'asset': asset, 'mean': mean_linear(images['albedo'])}


def main():
    force = '--force' in sys.argv
    import shutil
    catalog = {k: v for k, v in json.loads(CATALOG.read_text(encoding='utf-8')).items() if not k.startswith('_')}
    stats = {}
    for key, entry in catalog.items():
        print(f'· {key} ({entry["asset"]})', flush=True)
        stats[key] = process(key, entry, force)
    for d in OUT.iterdir() if OUT.exists() else []:
        if d.is_dir() and d.name not in catalog:
            shutil.rmtree(d)
    STATS.write_text(json.dumps(stats, indent=2) + '\n', encoding='utf-8')
    total = sum(f.stat().st_size for f in OUT.rglob('*.webp'))
    print(f'{len(stats)} superficies · {total / 1048576:.1f} MB en public/textures')


if __name__ == '__main__':
    main()
