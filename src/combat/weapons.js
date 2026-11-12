// Arsenal de Retícula. Cada arma define su balística, su manejo y su mira por defecto.
// Los valores son propios (inspirados en los arquetipos de los shooters, sin copiar ningún juego).
//
// rps: disparos por segundo · magazine: balas por cargador · reloadTime: s · drawTime: s al sacarla
// damage: daño por zona (cabeza/cuerpo/piernas) de cada bala o perdigón; los bots tienen 100 de vida
// fireModes: modos disponibles ('semi' | 'auto' | 'burst') y el primero es el de por defecto. Las
//   automáticas arrancan en automático: mantener el clic dispara (sin un clic por bala).
// burst / burstDelay: balas por ráfaga y pausa tras cada ráfaga (s) — rifle de ráfaga
// bloomPerShot / maxBloom / bloomRecovery: dispersión que acumula al disparar seguido (grados) y cuánto
//   recupera por segundo
// moveSpread: multiplicador de la imprecisión al moverse/saltar (1 = la del rifle)
// pellets / pelletSpread: perdigones por disparo y su cono (grados) — escopeta
// hipSpread: dispersión fija sin apuntar (grados) — francotirador
// zoom: aumento al apuntar con clic derecho (null = sin mira telescópica)
// ads: apuntar con las miras (clic derecho) en las armas sin mira telescópica: aumento, multiplicador de
//   la dispersión (ráfaga y movimiento) y de la velocidad al caminar apuntando
// recoil: fuerza del retroceso visual (0-1) · sound: perfil de sonido (audio/Sfx.js) · soundRate:
//   tono de la grabación (las armas nuevas reutilizan la de su familia, más grave o más aguda)

import { normalizeCrosshair } from '../ui/Crosshair.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    key: '1',
    name: 'Pistola',
    category: 'Secundaria',
    desc: 'Precisa al primer disparo y rápida de sacar. Castiga el spam: cada disparo seguido abre la dispersión.',
    rps: 6.5,
    magazine: 12,
    reloadTime: 1.5,
    drawTime: 0.25,
    damage: { head: 110, body: 30, legs: 24 },
    fireModes: ['semi'],
    bloomPerShot: 0.45,
    maxBloom: 2.4,
    bloomRecovery: 6,
    moveSpread: 0.8,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 0,
    zoom: null,
    ads: { zoom: 1.2, spread: 0.55, speed: 0.85 },
    recoil: 0.5,
    sound: 'pistol',
    crosshair: normalizeCrosshair({ shape: 'cross', color: '#ffffff', size: 4, thickness: 2, gap: 2, outline: true, opacity: 1, dot: false, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false }),
  },
  smg: {
    id: 'smg',
    key: '2',
    name: 'Subfusil',
    category: 'Automática',
    desc: 'Cadencia altísima y estable en movimiento. Ideal para tracking a corta y media distancia; poco daño por bala.',
    rps: 14,
    magazine: 30,
    reloadTime: 2.0,
    drawTime: 0.35,
    damage: { head: 90, body: 26, legs: 22 },
    fireModes: ['auto', 'semi'],
    bloomPerShot: 0.22,
    maxBloom: 3.2,
    bloomRecovery: 5,
    moveSpread: 0.55,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 0,
    zoom: null,
    ads: { zoom: 1.25, spread: 0.6, speed: 0.8 },
    recoil: 0.3,
    sound: 'smg',
    crosshair: normalizeCrosshair({ shape: 'cross', color: '#36d6ff', size: 5, thickness: 2, gap: 3, outline: true, opacity: 1, dot: true, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: true }),
  },
  rifle: {
    id: 'rifle',
    key: '3',
    name: 'Rifle',
    category: 'Asalto',
    desc: 'El arma de referencia: un tiro a la cabeza elimina y el cuerpo necesita tres. Es la que usa la evaluación.',
    rps: 9.75,
    magazine: 25,
    reloadTime: 2.2,
    drawTime: 0.4,
    damage: { head: 150, body: 40, legs: 34 },
    fireModes: ['auto', 'semi'],
    bloomPerShot: 0.3,
    maxBloom: 2.2,
    bloomRecovery: 5,
    moveSpread: 1,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 0,
    zoom: null,
    ads: { zoom: 1.35, spread: 0.45, speed: 0.75 },
    recoil: 0.55,
    sound: 'rifle',
    crosshair: normalizeCrosshair({ shape: 'cross', color: '#00ffa3', size: 6, thickness: 2, gap: 3, outline: true, opacity: 1, dot: false, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false }),
  },
  shotgun: {
    id: 'shotgun',
    key: '4',
    name: 'Escopeta',
    category: 'Corto alcance',
    desc: 'Nueve perdigones por disparo: letal de cerca, inútil de lejos. Su mira circular muestra el cono real.',
    rps: 1.25,
    magazine: 6,
    reloadTime: 2.8,
    drawTime: 0.5,
    damage: { head: 40, body: 18, legs: 14 },
    fireModes: ['semi'],
    bloomPerShot: 0,
    maxBloom: 0,
    bloomRecovery: 5,
    moveSpread: 0.7,
    pellets: 9,
    pelletSpread: 3.2,
    hipSpread: 0,
    zoom: null,
    ads: { zoom: 1.15, spread: 0.8, speed: 0.8 },
    recoil: 1,
    sound: 'shotgun',
    crosshair: normalizeCrosshair({ shape: 'circle', color: '#ffb020', size: 10, thickness: 2, gap: 6, outline: true, opacity: 1, dot: true, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false }),
  },
  sniper: {
    id: 'sniper',
    key: '5',
    name: 'Francotirador',
    category: 'Precisión',
    desc: 'Mantén clic derecho para apuntar con la mira telescópica (×4). Sin apuntar es muy impreciso. Un tiro al cuerpo casi elimina.',
    rps: 0.8,
    magazine: 5,
    reloadTime: 3.0,
    drawTime: 0.6,
    damage: { head: 300, body: 95, legs: 75 },
    fireModes: ['semi'],
    bloomPerShot: 0,
    maxBloom: 0,
    bloomRecovery: 5,
    moveSpread: 1.6,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 5,
    zoom: 4,
    ads: null,
    recoil: 1,
    sound: 'sniper',
    crosshair: normalizeCrosshair({ shape: 'dot', color: '#ff4d6d', size: 4, thickness: 2, gap: 2, outline: true, opacity: 1, dot: false, dotSize: 3, outlineThickness: 1, outlineColor: '#000000', dynamic: false }),
  },
  magnum: {
    id: 'magnum',
    key: '6',
    name: 'Revólver',
    category: 'Secundaria',
    desc: 'Seis balas que pegan como un rifle: un tiro a la cabeza elimina a cualquiera. Lento de disparar y de recargar.',
    rps: 2.2,
    magazine: 6,
    reloadTime: 2.4,
    drawTime: 0.35,
    damage: { head: 210, body: 62, legs: 46 },
    fireModes: ['semi'],
    bloomPerShot: 0.9,
    maxBloom: 3,
    bloomRecovery: 4,
    moveSpread: 0.9,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 0,
    zoom: null,
    ads: { zoom: 1.25, spread: 0.5, speed: 0.85 },
    recoil: 0.85,
    sound: 'pistol',
    soundRate: 0.72,
    crosshair: normalizeCrosshair({ shape: 'cross-dot', color: '#ffe14d', size: 4, thickness: 2, gap: 3, outline: true, opacity: 1, dot: true, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false }),
  },
  burst: {
    id: 'burst',
    key: '7',
    name: 'Rifle de ráfaga',
    category: 'Asalto',
    desc: 'Tres balas por clic, muy juntas. Premia la primera bala a la cabeza; entre ráfagas hay una pausa corta.',
    rps: 15,
    magazine: 30,
    reloadTime: 2.3,
    drawTime: 0.4,
    damage: { head: 120, body: 34, legs: 28 },
    fireModes: ['burst'],
    burst: 3,
    burstDelay: 0.28,
    bloomPerShot: 0.12,
    maxBloom: 1.6,
    bloomRecovery: 6,
    moveSpread: 0.95,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 0,
    zoom: null,
    ads: { zoom: 1.35, spread: 0.45, speed: 0.75 },
    recoil: 0.45,
    sound: 'rifle',
    soundRate: 1.12,
    crosshair: normalizeCrosshair({ shape: 'cross', color: '#c8ff2e', size: 5, thickness: 2, gap: 3, outline: true, opacity: 1, dot: true, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false }),
  },
  lmg: {
    id: 'lmg',
    key: '8',
    name: 'Ametralladora',
    category: 'Pesada',
    desc: 'Cargador de 75 balas para no soltar el gatillo. Pesada: se mueve lento, tarda en sacarse y su recarga es larga.',
    rps: 11,
    magazine: 75,
    reloadTime: 4.2,
    drawTime: 0.8,
    damage: { head: 105, body: 36, legs: 30 },
    fireModes: ['auto'],
    bloomPerShot: 0.17,
    maxBloom: 3.8,
    bloomRecovery: 4,
    moveSpread: 1.5,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 0,
    zoom: null,
    ads: { zoom: 1.3, spread: 0.55, speed: 0.6 },
    recoil: 0.6,
    sound: 'rifle',
    soundRate: 0.82,
    crosshair: normalizeCrosshair({ shape: 'cross', color: '#ff9f43', size: 6, thickness: 2, gap: 5, outline: true, opacity: 1, dot: false, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: true }),
  },
  dmr: {
    id: 'dmr',
    key: '9',
    name: 'Fusil de tirador',
    category: 'Precisión',
    desc: 'Semiautomático de larga distancia con mira de aumento ×2.5 (clic derecho). Más rápido que el francotirador, con menos daño.',
    rps: 3.4,
    magazine: 12,
    reloadTime: 2.6,
    drawTime: 0.5,
    damage: { head: 230, body: 72, legs: 56 },
    fireModes: ['semi'],
    bloomPerShot: 0.35,
    maxBloom: 1.8,
    bloomRecovery: 5,
    moveSpread: 1.3,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 2.5,
    zoom: 2.5,
    ads: null,
    recoil: 0.7,
    sound: 'sniper',
    soundRate: 1.25,
    crosshair: normalizeCrosshair({ shape: 'cross-dot', color: '#36d6ff', size: 3, thickness: 1, gap: 2, outline: true, opacity: 1, dot: true, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false }),
  },
};

// Arma especial del modo zombi (no está en el arsenal de entrenamiento): sale de la caja misteriosa o
// se compra en la terraza de la Feria. Un rayo de energía que deshace a casi cualquier zombi de un tiro.
WEAPONS.ray = {
  id: 'ray',
  key: '0',
  name: 'Desintegrador',
  category: 'Especial',
  special: true,
  desc: 'Arma especial: rayos de energía que deshacen a casi cualquier zombi de un tiro. Pocas cargas y recarga lenta.',
  rps: 2.6,
  magazine: 8,
  reloadTime: 2.8,
  drawTime: 0.6,
  damage: { head: 1500, body: 900, legs: 700 },
  fireModes: ['semi'],
  bloomPerShot: 0.3,
  maxBloom: 1.6,
  bloomRecovery: 5,
  moveSpread: 0.9,
  pellets: 1,
  pelletSpread: 0,
  hipSpread: 0,
  zoom: null,
  ads: { zoom: 1.2, spread: 0.5, speed: 0.85 },
  recoil: 0.55,
  sound: 'sniper',
  soundRate: 1.7,
  crosshair: normalizeCrosshair({ shape: 'circle', color: '#c77dff', size: 6, thickness: 2, gap: 3, outline: true, opacity: 1, dot: true, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false }),
};

// Orden de las teclas (1-9): las cinco de siempre conservan su número.
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'magnum', 'burst', 'lmg', 'dmr'];
// Todas, con las especiales (munición por arma, modelos).
export const ALL_WEAPONS = [...WEAPON_ORDER, 'ray'];
export const DEFAULT_WEAPON = 'rifle';
export const EVALUATION_WEAPON = 'rifle'; // la evaluación siempre con el rifle: rangos comparables

export function getWeapon(id) {
  return WEAPONS[id] ?? WEAPONS[DEFAULT_WEAPON];
}

// Daño máximo de un disparo a una zona (todos los perdigones).
export const shotDamage = (w, part) => w.damage[part] * w.pellets;

// Disparos por segundo sostenidos: en ráfaga cuenta la pausa entre ráfagas.
export const sustainedRps = (w) => (w.burst ? w.burst / (w.burst / w.rps + w.burstDelay) : w.rps);

// Valoraciones 0-1 para comparar armas en el arsenal (normalizadas contra el arsenal).
export function weaponRatings(w) {
  const all = WEAPON_ORDER.map((id) => WEAPONS[id]);
  const max = (f) => Math.max(...all.map(f));
  const dps = (x) => shotDamage(x, 'body') * sustainedRps(x);
  const precision = (x) => 1 / (1 + x.maxBloom + x.hipSpread * (x.zoom ? 0.2 : 1) + x.pelletSpread);
  return {
    damage: shotDamage(w, 'body') / max((x) => shotDamage(x, 'body')),
    rate: sustainedRps(w) / max(sustainedRps),
    dps: dps(w) / max(dps),
    precision: precision(w) / max(precision),
    mobility: (1 / w.moveSpread) / max((x) => 1 / x.moveSpread),
    magazine: w.magazine / max((x) => x.magazine),
  };
}
