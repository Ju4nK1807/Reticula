// Siluetas laterales de las armas (SVG, viewBox 0 0 120 40), en el mismo estilo low-poly del juego.
const PATHS = {
  pistol: 'M34 12h44v8H52l-3 4h-9l4 12h-9l-5-14v-2h-2z M78 14h6v4h-6z',
  smg: 'M20 14h56v8H64l-2 14h-7l1-14H44l-4 6h-8l3-6H20z M76 16h16v4H76z M8 15h12v3H12l-2 5H6z',
  rifle: 'M18 13h62v8H62l-2 12h-7l1-12H42l-4 6h-8l3-6H18z M80 15h28v3H80z M4 13h14v4l-8 6H3z M46 10h12v3H46z',
  shotgun: 'M24 14h40v7H50l-4 6h-9l3-6H24z M64 14h50v4H64z M66 19h22v4H66z M4 15h20v4L12 26H4z',
  sniper: 'M22 15h48v7H56l-4 6h-9l3-6H22z M70 16h46v3H70z M38 7h26v5H38z M42 12h3v3h-3z M58 12h3v3h-3z M2 15h20v4l-9 7H2z M84 19l-6 12M88 19l6 12',
};

export function weaponIcon(id, color = 'currentColor') {
  const d = PATHS[id] ?? PATHS.rifle;
  return `<svg viewBox="0 0 120 40" aria-hidden="true"><path d="${d}" fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
}
