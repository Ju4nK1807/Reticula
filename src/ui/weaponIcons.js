// Siluetas laterales de las armas (SVG, viewBox 0 0 120 40), en el mismo estilo low-poly del juego.
//
// Para reemplazarlas por imágenes (en el HUD): poner el archivo en public/icons/weapons/ y su ruta en
// ICON_IMAGES (p. ej. `pistol: 'icons/weapons/pistol.png'`), con fondo transparente y el cañón hacia la
// derecha. Con imagen se usa la imagen; sin ella, la silueta.
export const ICON_IMAGES = {};

const PATHS = {
  pistol: 'M34 12h44v8H52l-3 4h-9l4 12h-9l-5-14v-2h-2z M78 14h6v4h-6z',
  smg: 'M20 14h56v8H64l-2 14h-7l1-14H44l-4 6h-8l3-6H20z M76 16h16v4H76z M8 15h12v3H12l-2 5H6z',
  rifle: 'M18 13h62v8H62l-2 12h-7l1-12H42l-4 6h-8l3-6H18z M80 15h28v3H80z M4 13h14v4l-8 6H3z M46 10h12v3H46z',
  shotgun: 'M24 14h40v7H50l-4 6h-9l3-6H24z M64 14h50v4H64z M66 19h22v4H66z M4 15h20v4L12 26H4z',
  sniper: 'M22 15h48v7H56l-4 6h-9l3-6H22z M70 16h46v3H70z M38 7h26v5H38z M42 12h3v3h-3z M58 12h3v3h-3z M2 15h20v4l-9 7H2z M84 19l-6 12M88 19l6 12',
  magnum: 'M30 13h54v7H58l-3 3h-7l-2 2h-6l4 11h-9l-5-12v-4h-2z M40 10h16v12H40z M84 14h10v4H84z',
  burst: 'M18 13h60v8H62l-2 12h-7l1-12H42l-4 6h-8l3-6H18z M78 15h26v3H78z M4 13h14v4l-8 6H3z M48 9h14v4H48z M66 21h6v4h-6z',
  lmg: 'M14 12h70v9H62l-2 12h-7l1-12H40l-4 6h-8l3-6H14z M84 14h30v4H84z M2 12h12v5l-8 6H1z M40 21h16v10H40z M96 18l-5 14M100 18l5 14',
  dmr: 'M22 15h46v7H56l-4 6h-9l3-6H22z M68 16h34v3H68z M38 9h22v4H38z M4 15h18v4l-8 7H4z M44 21h8v8h-8z',
  // Desintegrador (especial): cuerpo grueso con bobinas, cañón con anillos y tanque de energía.
  ray: 'M24 11h46v13H60l-2 12h-8l1-12H42l-4 7h-9l3-7h-8z M70 14h10v7H70z M80 12h4v11h-4z M86 12h4v11h-4z M92 15h18v5H92z M32 6h24v5H32z M10 14h14v6H10z',
};

export function weaponIcon(id, color = 'currentColor') {
  const d = PATHS[id] ?? PATHS.rifle;
  return `<svg viewBox="0 0 120 40" aria-hidden="true"><path d="${d}" fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
}

/** Ícono como elemento (HUD): la imagen de ICON_IMAGES si la hay; si no, la silueta. */
export function weaponIconEl(id) {
  const src = ICON_IMAGES[id];
  if (src) {
    const img = document.createElement('img');
    img.className = 'weapon-icon';
    img.src = `${import.meta.env?.BASE_URL ?? './'}${src}`;
    img.alt = '';
    return img;
  }
  const span = document.createElement('span');
  span.className = `weapon-icon${id === 'ray' ? ' special' : ''}`;
  span.innerHTML = weaponIcon(id);
  return span;
}
