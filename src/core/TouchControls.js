import '../ui/touch.css';
import { icon } from '../ui/icons.js';

export const JOYSTICK_RADIUS = 56; // px que recorre la palanca
export const JOYSTICK_DEADZONE = 0.14; // zona muerta (fracción del radio)
export const TOUCH_DEG_PER_PX = 0.16; // grados que gira la cámara por píxel arrastrado con sensibilidad 1

// ¿Usar controles táctiles? mode: 'auto' (sin mouse y con pantalla táctil) | 'on' | 'off'.
// ¿Corre dentro de la app nativa de Android (Capacitor)? Ahí 'auto' siempre es táctil, aunque el
// sistema anuncie un puntero fino (emuladores, teléfonos con lápiz o mouse Bluetooth conectado).
export function isNativeAndroid(cap = globalThis.Capacitor) {
  return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === 'android';
}

export function resolveTouchMode(mode, media = globalThis.matchMedia?.bind(globalThis), native = isNativeAndroid()) {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  if (native) return true;
  if (!media) return false;
  return media('(any-pointer: coarse)').matches && !media('(any-pointer: fine)').matches;
}

// Eje del joystick a partir del desplazamiento del dedo: x derecha, y adelante (pantalla hacia arriba).
// Zona muerta y reescalado para que el borde de la zona muerta empiece en 0 (sin saltos).
export function joystickAxis(dx, dy, radius = JOYSTICK_RADIUS, deadzone = JOYSTICK_DEADZONE) {
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0, mag: 0 };
  const raw = Math.min(1, len / radius);
  const mag = raw <= deadzone ? 0 : (raw - deadzone) / (1 - deadzone);
  return { x: (dx / len) * mag, y: (-dy / len) * mag, mag };
}

// Píxeles arrastrados → "counts" de mouse equivalentes, para que la mirada táctil no dependa de la
// sensibilidad del mouse (radPerCount): solo de la sensibilidad táctil.
export function touchLookCounts(px, touchSensitivity, radPerCount) {
  return (px * TOUCH_DEG_PER_PX * touchSensitivity * (Math.PI / 180)) / radPerCount;
}

/*
  Controles táctiles para teléfonos y tabletas (APK y navegador móvil):
  - Mitad izquierda: joystick flotante (aparece donde se apoya el dedo) → movimiento analógico.
  - Mitad derecha: arrastrar para apuntar.
  - Botones: disparar (también apunta al arrastrar, como en los shooters móviles), mira telescópica,
    recargar, saltar, agacharse, cambiar de arma y pausa.
  Multitáctil: cada dedo se sigue por su identificador; un dedo nuevo no "roba" el joystick.
  Solo se muestra en partida.
*/
export class TouchControls {
  constructor(game, root) {
    this.game = game;
    this.input = game.input;
    this.stick = null; // { id, x0, y0 }
    this.lookers = new Map(); // id → { x, y }
    this.visible = null;
    this.crouched = false;

    const btn = (cls, label, iconName, extra = '') =>
      `<button class="tc-btn ${cls}" type="button" aria-label="${label}" data-action="${cls}">${icon(iconName, 22)}${extra}</button>`;
    this.el = document.createElement('div');
    this.el.className = 'touch-controls';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="tc-stick-zone" data-zone="stick"></div>
      <div class="tc-look-zone" data-zone="look"></div>
      <div class="tc-stick" hidden><i></i></div>
      ${btn('pause', 'Pausa', 'gear')}
      <div class="tc-cluster">
        ${btn('fire', 'Disparar', 'target')}
        ${btn('aim', 'Apuntar', 'eye')}
        ${btn('reload', 'Recargar', 'bolt')}
        ${btn('jump', 'Saltar', 'arrow')}
        ${btn('crouch', 'Agacharse', 'back')}
        ${btn('weapon', 'Cambiar de arma', 'gun', '<span class="tc-weapon-key"></span>')}
        ${btn('melee', 'Golpe cuerpo a cuerpo', 'knife')}
        ${btn('grenade', 'Granada', 'grenade')}
      </div>
      ${btn('shop', 'Armería', 'cart', '<span class="tc-label">Armería</span>')}
      ${btn('light', 'Linterna', 'flashlight')}`;
    root.append(this.el);
    this.stickEl = this.el.querySelector('.tc-stick');
    this.knob = this.stickEl.querySelector('i');
    this.weaponKey = this.el.querySelector('.tc-weapon-key');

    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    for (const type of ['pointerup', 'pointercancel']) this.el.addEventListener(type, (e) => this.onUp(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Mostrar solo en partida (mouse "capturado" y sin pausa). Llamar cada cuadro: solo toca el DOM al cambiar.
  setVisible(on) {
    if (on === this.visible) return;
    this.visible = on;
    this.el.hidden = !on;
    if (!on) this.reset();
  }

  update() {
    const w = this.game.weapon;
    // Botón de apuntar: mira telescópica o, en las demás armas, las miras (salvo en la evaluación).
    this.el.classList.toggle('has-zoom', !!w.stats.zoom || (!!w.stats.ads && this.game.adsAllowed()));
    this.el.classList.toggle('aiming', this.input.aimDown);
    this.el.classList.toggle('crouched', this.crouched);
    // Botones que dependen del modo: golpe, granada (si quedan) y armería (entre oleadas).
    const m = this.game.mode;
    this.el.classList.toggle('can-melee', !!m?.meleeAllowed?.());
    this.el.classList.toggle('can-grenade', !!m?.grenadesAllowed?.() && (m.grenades ?? 0) > 0);
    // Botón de usar: armería entre oleadas o lo comprable que hay delante (puerta, arma, bebida).
    this.el.classList.toggle('can-shop', (m?.state === 'intermission' && !!m.openShop) || !!m?.near || !!m?.nearBarricade);
    // Linterna (modo zombi): el botón se ve encendido mientras alumbra.
    this.el.classList.toggle('can-light', !!m?.flashlight);
    this.el.classList.toggle('light-on', !!m?.flashlight?.on);
    if (this.weaponKey.textContent !== w.stats.key) this.weaponKey.textContent = w.stats.key;
  }

  reset() {
    this.stick = null;
    this.lookers.clear();
    this.stickEl.hidden = true;
    this.input.axis.x = this.input.axis.y = 0;
    this.input.mouseDown = false;
    this.input.aimDown = false;
    this.input.keys.delete(this.input.codeFor('jump'));
    this.input.keys.delete(this.input.codeFor('crouch'));
    this.crouched = false;
  }

  onDown(e) {
    if (e.pointerType === 'mouse') return; // con mouse se juega con Pointer Lock normal
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    const action = e.target.closest('[data-action]')?.dataset.action;
    const zone = e.target.closest('[data-zone]')?.dataset.zone;
    const inp = this.input;
    switch (action) {
      case 'fire':
        inp.mouseDown = true;
        inp.emit('shoot', e.timeStamp);
        this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY, fire: true });
        return;
      case 'aim':
        inp.aimDown = !inp.aimDown;
        return;
      case 'reload':
        if (this.game.weapon.enabled) this.game.weapon.reload();
        return;
      case 'jump':
        inp.keys.add(inp.codeFor('jump'));
        this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY, jump: true });
        return;
      case 'crouch':
        this.crouched = !this.crouched;
        if (this.crouched) inp.keys.add(inp.codeFor('crouch'));
        else inp.keys.delete(inp.codeFor('crouch'));
        return;
      case 'weapon': {
        // Siguiente arma que se tiene (en el modo zombi, sus espacios).
        this.game.cycleWeapon(1);
        return;
      }
      case 'melee':
        this.game.melee.trigger();
        return;
      case 'grenade':
        this.game.grenades.throw();
        return;
      case 'light':
        this.game.mode?.toggleFlashlight?.();
        return;
      case 'shop':
        // Junto a una barricada, mantener el botón repara (como mantener la tecla de usar).
        if (this.game.mode?.nearBarricade) {
          inp.keys.add(inp.codeFor('interact'));
          this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY, jump: true, interact: true });
        } else if (this.game.mode?.near) this.game.mode.buyNear();
        else this.game.mode?.openShop?.();
        return;
      case 'pause':
        inp.unlock();
        return;
    }
    if (zone === 'stick' && !this.stick) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      this.stickEl.hidden = false;
      this.stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.knob.style.transform = 'translate(0px, 0px)';
    } else {
      this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  onMove(e) {
    if (e.pointerType === 'mouse') return;
    if (this.stick?.id === e.pointerId) {
      const dx = e.clientX - this.stick.x0;
      const dy = e.clientY - this.stick.y0;
      const a = joystickAxis(dx, dy);
      this.input.axis.x = a.x;
      this.input.axis.y = a.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, JOYSTICK_RADIUS / len);
      this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      return;
    }
    const look = this.lookers.get(e.pointerId);
    if (!look || look.jump) return;
    const touch = this.game.settings.touch;
    const rad = this.game.player.radPerCount;
    this.input.dx += touchLookCounts(e.clientX - look.x, touch.sensitivity, rad);
    this.input.dy += touchLookCounts(e.clientY - look.y, touch.sensitivity, rad) * (touch.invertY ? -1 : 1);
    look.x = e.clientX;
    look.y = e.clientY;
  }

  onUp(e) {
    if (this.stick?.id === e.pointerId) {
      this.stick = null;
      this.stickEl.hidden = true;
      this.input.axis.x = this.input.axis.y = 0;
      return;
    }
    const look = this.lookers.get(e.pointerId);
    if (look?.fire) this.input.mouseDown = false;
    if (look?.interact) this.input.keys.delete(this.input.codeFor('interact'));
    else if (look?.jump) this.input.keys.delete(this.input.codeFor('jump'));
    this.lookers.delete(e.pointerId);
  }
}
