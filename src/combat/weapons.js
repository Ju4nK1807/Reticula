// Arsenal de Retícula. Cada arma define su balística, su manejo y su mira por defecto.
// Los valores son propios (inspirados en los arquetipos de los shooters, sin copiar ningún juego).
//
// rps: disparos por segundo · magazine: balas por cargador · reloadTime: s · drawTime: s al sacarla
// damage: daño por zona (cabeza/cuerpo/piernas) de cada bala o perdigón; los bots tienen 100 de vida
// fireModes: modos disponibles ('semi' | 'auto') y el primero es el de por defecto
// bloomPerShot / maxBloom / bloomRecovery: dispersión que acumula al disparar seguido (grados) y cuánto
//   recupera por segundo
// moveSpread: multiplicador de la imprecisión al moverse/saltar (1 = la del rifle)
// pellets / pelletSpread: perdigones por disparo y su cono (grados) — escopeta
// hipSpread: dispersión fija sin apuntar (grados) — francotirador
// zoom: aumento al apuntar con clic derecho (null = sin mira telescópica)
// ads: apuntar con las miras (clic derecho) en las armas sin mira telescópica: aumento, multiplicador de
//   la dispersión (ráfaga y movimiento) y de la velocidad al caminar apuntando
// recoil: fuerza del retroceso visual (0-1) · sound: perfil de sonido (audio/Sfx.js)

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
    crosshair: { shape: 'cross', color: '#ffffff', size: 4, thickness: 2, gap: 2, outline: true, opacity: 1, dot: false, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false },
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
    crosshair: { shape: 'cross', color: '#36d6ff', size: 5, thickness: 2, gap: 3, outline: true, opacity: 1, dot: true, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: true },
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
    fireModes: ['semi', 'auto'],
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
    crosshair: { shape: 'cross', color: '#00ffa3', size: 6, thickness: 2, gap: 3, outline: true, opacity: 1, dot: false, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false },
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
    crosshair: { shape: 'circle', color: '#ffb020', size: 10, thickness: 2, gap: 6, outline: true, opacity: 1, dot: true, dotSize: 2, outlineThickness: 1, outlineColor: '#000000', dynamic: false },
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
    crosshair: { shape: 'dot', color: '#ff4d6d', size: 4, thickness: 2, gap: 2, outline: true, opacity: 1, dot: false, dotSize: 3, outlineThickness: 1, outlineColor: '#000000', dynamic: false },
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'];
export const DEFAULT_WEAPON = 'rifle';
export const EVALUATION_WEAPON = 'rifle'; // la evaluación siempre con el rifle: rangos comparables

export function getWeapon(id) {
  return WEAPONS[id] ?? WEAPONS[DEFAULT_WEAPON];
}

// Daño máximo de un disparo a una zona (todos los perdigones).
export const shotDamage = (w, part) => w.damage[part] * w.pellets;

// Valoraciones 0-1 para comparar armas en el arsenal (normalizadas contra el arsenal).
export function weaponRatings(w) {
  const all = WEAPON_ORDER.map((id) => WEAPONS[id]);
  const max = (f) => Math.max(...all.map(f));
  const dps = (x) => shotDamage(x, 'body') * x.rps;
  const precision = (x) => 1 / (1 + x.maxBloom + x.hipSpread * (x.zoom ? 0.2 : 1) + x.pelletSpread);
  return {
    damage: shotDamage(w, 'body') / max((x) => shotDamage(x, 'body')),
    rate: w.rps / max((x) => x.rps),
    dps: dps(w) / max(dps),
    precision: precision(w) / max(precision),
    mobility: (1 / w.moveSpread) / max((x) => 1 / x.moveSpread),
    magazine: w.magazine / max((x) => x.magazine),
  };
}
