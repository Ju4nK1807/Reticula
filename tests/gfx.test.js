import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import CATALOG from '../src/gfx/surfaces.json';
import STATS from '../src/gfx/textureStats.json';
import { SURFACE_KEYS, boxWorldUV, glow, planeWorldUV, setGlowBloom, surface, tileOf, tintFor } from '../src/gfx/surfaces.js';
import { QUALITY_PRESETS, resolveQuality } from '../src/config/quality.js';

const TEX_DIR = path.resolve(__dirname, '../public/textures');

describe('superficies PBR', () => {
  it('cada superficie del catálogo tiene sus texturas en 1K y 512 y su color medio', () => {
    for (const key of SURFACE_KEYS) {
      for (const size of ['1k', '512']) {
        for (const map of ['albedo', 'normal', 'arm']) {
          expect(fs.existsSync(path.join(TEX_DIR, key, size, `${map}.webp`)), `${key}/${size}/${map}`).toBe(true);
        }
      }
      expect(STATS[key]?.mean).toHaveLength(3);
      expect(STATS[key].asset).toBe(CATALOG[key].asset);
    }
  });

  it('no quedan texturas de superficies que ya no están en el catálogo', () => {
    const dirs = fs.readdirSync(TEX_DIR).filter((d) => fs.statSync(path.join(TEX_DIR, d)).isDirectory());
    expect(dirs.sort()).toEqual([...SURFACE_KEYS].sort());
  });

  it('el tinte hace que el color medio sea exactamente el de la paleta', () => {
    const key = 'concrete';
    const target = new THREE.Color('#4a5260');
    const tint = tintFor(key, '#4a5260');
    const mean = STATS[key].mean;
    expect(tint.r * mean[0]).toBeCloseTo(target.r, 4);
    expect(tint.g * mean[1]).toBeCloseTo(target.g, 4);
    expect(tint.b * mean[2]).toBeCloseTo(target.b, 4);
  });

  it('el tinte tiene un tope (no amplifica sin límite canales casi negros)', () => {
    const tint = tintFor('wood', '#00ffff');
    expect(Math.max(tint.r, tint.g, tint.b)).toBeLessThanOrEqual(6);
  });

  it('surface crea un material PBR con la escala de la textura y rechaza claves desconocidas', () => {
    const m = surface('concrete_wall', '#333c4a');
    expect(m.isMeshStandardMaterial).toBe(true);
    expect(tileOf(m)).toBe(CATALOG.concrete_wall.tile);
    expect(tileOf(new THREE.MeshBasicMaterial())).toBeNull();
    expect(() => surface('no-existe', '#fff')).toThrow();
  });

  it('las UVs de una caja van en metros: cada cara repite según su tamaño', () => {
    const tile = 2;
    const geo = boxWorldUV(new THREE.BoxGeometry(8, 4, 1), 8, 4, 1, tile);
    const uv = geo.attributes.uv;
    const range = (face, axis) => {
      const vals = [0, 1, 2, 3].map((i) => (axis === 'u' ? uv.getX(face * 4 + i) : uv.getY(face * 4 + i)));
      return Math.max(...vals) - Math.min(...vals);
    };
    expect(range(4, 'u')).toBeCloseTo(8 / tile); // cara +z: ancho
    expect(range(4, 'v')).toBeCloseTo(4 / tile); // cara +z: alto
    expect(range(0, 'u')).toBeCloseTo(1 / tile); // cara +x: profundidad
    expect(range(2, 'v')).toBeCloseTo(1 / tile); // cara +y: profundidad
  });

  it('las UVs de un plano van en metros', () => {
    const geo = planeWorldUV(new THREE.PlaneGeometry(40, 10), 40, 10, 4);
    const us = Array.from({ length: geo.attributes.uv.count }, (_, i) => geo.attributes.uv.getX(i));
    expect(Math.max(...us)).toBeCloseTo(10);
  });

  it('el neón solo se vuelve HDR con bloom y vuelve a su color sin él', () => {
    const m = glow('#00ffa3');
    const base = m.color.clone();
    setGlowBloom(true);
    expect(m.color.g).toBeGreaterThan(base.g);
    setGlowBloom(false);
    expect(m.color.equals(base)).toBe(true);
    expect(m.toneMapped).toBe(false);
  });
});

describe('calidad gráfica: nivel de detalle', () => {
  it('cada preset tiene su detalle', () => {
    for (const [id, p] of Object.entries(QUALITY_PRESETS)) expect(resolveQuality({ quality: id }).detail).toBe(p.detail);
  });

  it('personalizada usa el detalle elegido o medio por defecto', () => {
    expect(resolveQuality({ quality: 'custom', renderScale: 0.8 }).detail).toBe('media');
    expect(resolveQuality({ quality: 'custom', renderScale: 0.8, detail: 'baja' }).detail).toBe('baja');
    expect(resolveQuality({ quality: 'custom', detail: 'ultra' }).detail).toBe('media');
  });
});
