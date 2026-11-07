import * as THREE from 'three';
import { castsShadow } from '../../gfx/lighting.js';

/*
  Apariencia animada de los zombis (modelos CC-BY: ver public/models/characters/credits.json).
  Igual que los soldados: es SOLO visual; los impactos los deciden las hitboxes de Zombie.js.

  - Dos modelos: "walker" (caminante, reptante y bruto) y "runner" (corredor).
  - Se clonan por zombi (esqueleto propio), con materiales propios para el destello al recibir daño
    y el tinte del bruto, y se reciclan en una reserva al morir (aparecer no cuesta).
  - Animaciones con transiciones suaves; la velocidad de los ciclos de caminar o correr sigue la del
    zombi. Si un modelo no trae muerte, cae hacia atrás por código.
*/

const BASE = `${import.meta.env?.BASE_URL ?? './'}models/characters/`;
const FADE = 0.22;

const ANIM_FAR = 22; // m: más lejos, animación a 20 Hz
const ANIM_FAR_STEP = 1 / 20;
const SHADOW_NEAR = 16; // m: solo los zombis cercanos proyectan sombra

export const ZOMBIE_MODELS = {
  walker: {
    file: 'zombie-walker.glb',
    clips: { idle: 'Idle', walk: 'Walk', fast: 'Walk2', crawl: 'Running_Crawl', attack: 'Attack', heavy: 'Headbutt', hit: 'Hit_reaction', die: 'Die', die2: 'Die2', scream: 'Scream' },
    // m/s a los que cada ciclo se ve natural (la animación se acelera o frena según la velocidad real).
    pace: { walk: 0.9, fast: 1.9, crawl: 2.1 },
  },
  runner: {
    file: 'zombie-runner.glb',
    clips: { idle: 'ZombieIdle', walk: 'ZombieWalk', run: 'ZombieRun', attack: 'ZombieBite', crawl: 'ZombieCrawl' },
    pace: { walk: 0.9, run: 4.2 },
  },
};

const LOOP_ONCE = new Set(['die', 'die2', 'hit', 'scream']);
const POOL_MAX = 28;
const pool = new Map(); // `${modelo}|${tinte}` → ZombieSkin[]
const templates = new Map(); // modelo → Promise

/** Carga (una vez) un modelo de zombi: escena, clips y su altura original (para escalarlo). */
export function loadZombieModel(model) {
  if (typeof document === 'undefined' || !ZOMBIE_MODELS[model]) return Promise.resolve(null);
  if (!templates.has(model)) {
    templates.set(
      model,
      (async () => {
        const [{ GLTFLoader }, SkeletonUtils] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
        const gltf = await new GLTFLoader().loadAsync(BASE + ZOMBIE_MODELS[model].file);
        const clips = {};
        for (const [key, name] of Object.entries(ZOMBIE_MODELS[model].clips)) {
          const clip = gltf.animations.find((a) => a.name === name || a.name.endsWith(`|${name}`));
          if (clip) clips[key] = clip;
        }
        // Altura en la pose de reposo (con la primera animación aplicada, no en T).
        const mixer = new THREE.AnimationMixer(gltf.scene);
        if (clips.idle) mixer.clipAction(clips.idle).play();
        mixer.update(0);
        gltf.scene.updateMatrixWorld(true);
        const height = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y || 1;
        mixer.stopAllAction();
        mixer.uncacheRoot(gltf.scene);
        return { model, scene: gltf.scene, clips, height, clone: SkeletonUtils.clone };
      })().catch(() => null),
    );
  }
  return templates.get(model);
}

/** Zombi listo: de la reserva si hay, si no uno nuevo. */
export function acquireZombieSkin(template, { height, tint = null }) {
  const key = `${template.model}|${tint ?? ''}`;
  const skin = pool.get(key)?.pop();
  if (skin) {
    skin.reset(height);
    return skin;
  }
  return new ZombieSkin(template, { height, tint, key });
}

/** Crea un zombi nuevo directamente en la reserva (para llenarla antes de que haga falta). */
export function prefillZombieSkin(template, { height, tint = null }) {
  const key = `${template.model}|${tint ?? ''}`;
  releaseZombieSkin(new ZombieSkin(template, { height, tint, key }));
}

/** Zombis de ese modelo y tinte ya creados y esperando en la reserva. */
export function pooledZombieSkins(model, tint = null) {
  return pool.get(`${model}|${tint ?? ''}`)?.length ?? 0;
}

export function releaseZombieSkin(skin) {
  skin.root.removeFromParent();
  const list = pool.get(skin.key) ?? [];
  pool.set(skin.key, list);
  if (list.length >= POOL_MAX) skin.dispose();
  else {
    skin.mixer.stopAllAction();
    list.push(skin);
  }
}

export class ZombieSkin {
  constructor(template, { height, tint, key }) {
    this.key = key;
    this.model = template.model;
    this.baseHeight = template.height;
    this.pace = ZOMBIE_MODELS[template.model].pace;
    this.root = new THREE.Group();
    this.body = template.clone(template.scene);
    this.root.add(this.body);
    this.mats = [];
    const tintColor = tint ? new THREE.Color(tint) : null;
    this.body.traverse((o) => {
      if (!o.isMesh) return;
      // Esfera de recorte fija y holgada (la de la piel no sigue a la animación).
      if (o.isSkinnedMesh) {
        o.geometry.computeBoundingSphere();
        o.boundingSphere = o.geometry.boundingSphere.clone();
        o.boundingSphere.radius *= 1.6;
        o.frustumCulled = true;
      }
      const m = o.material.clone();
      if (tintColor) m.color.multiply(tintColor);
      m.emissive = new THREE.Color('#ff3b2f');
      m.emissiveIntensity = 0;
      o.material = m;
      this.mats.push(m);
    });
    castsShadow(this.body);
    // Hueso de la cabeza (Mixamo: "mixamorigHead" / "Head"): al decapitar se encoge a cero.
    this.headBone = null;
    this.body.traverse((o) => {
      if (!this.headBone && o.isBone && /(^|[:_])?head$/i.test(o.name) && !/top/i.test(o.name)) this.headBone = o;
    });
    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {};
    for (const [k, clip] of Object.entries(template.clips)) {
      const a = this.mixer.clipAction(clip);
      if (LOOP_ONCE.has(k)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[k] = a;
    }
    this.reset(height);
  }

  reset(height) {
    this.mixer.stopAllAction();
    this.current = null;
    this.currentKey = null;
    this.fall = 0;
    // Tamaño respecto a un zombi normal: uno más grande da pasos más largos (su ciclo va más lento).
    this.size = height / 1.78;
    this.headless = false;
    if (this.headBone) this.headBone.scale.setScalar(1);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.body.scale.setScalar(height / this.baseHeight);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    for (const m of this.mats) m.emissiveIntensity = 0;
    this.play('idle', 0);
  }

  has(key) {
    return !!this.actions[key];
  }

  // Le vuela la cabeza (headshot): el hueso queda en cero hasta que el zombi vuelve a la reserva.
  decapitate() {
    this.headless = true;
    this.headBone?.scale.setScalar(0.001);
  }

  // Empieza el ciclo actual en un punto al azar: dos zombis nunca dan el mismo paso a la vez.
  desync() {
    const a = this.current;
    if (a) a.time = Math.random() * a.getClip().duration;
  }

  play(key, fade = FADE) {
    const next = this.actions[key];
    if (!next || this.current === next) return;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
    this.currentKey = key;
  }

  /**
   * @param {number} dt
   * @param {{ anim: string, speed?: number, cycle?: number, flash?: number, falling?: boolean }} s
   *   anim: clave de animación · speed: m/s reales (ajusta el ritmo de caminar/correr) ·
   *   cycle: s que debe durar un ciclo (ataques) · falling: muerte sin animación propia
   */
  update(dt, s) {
    // Nivel de detalle: de lejos la animación se actualiza a 20 Hz y el zombi no proyecta sombra (cada
    // sombra de un cuerpo animado lo vuelve a dibujar entero). Con muchos zombis es lo que más se nota.
    const far = (s.distance ?? 0) > ANIM_FAR;
    const shadow = (s.distance ?? 0) < SHADOW_NEAR;
    if (shadow !== this.shadow) {
      this.shadow = shadow;
      this.body.traverse((o) => o.isMesh && (o.castShadow = shadow));
    }
    this.animAcc = (this.animAcc ?? 0) + dt;
    if (far && this.animAcc < ANIM_FAR_STEP && !s.falling) return;
    dt = this.animAcc;
    this.animAcc = 0;
    // Si el modelo no tiene la animación pedida, la más parecida que sí tenga.
    let key = s.anim;
    if (!this.has(key)) key = key === 'run' && this.has('fast') ? 'fast' : key === 'die2' && this.has('die') ? 'die' : this.has('walk') ? 'walk' : 'idle';
    this.play(key);
    const a = this.current;
    if (a) {
      const pace = this.pace[key] ? this.pace[key] * (this.size ?? 1) : 0;
      if (pace && s.speed) a.timeScale = THREE.MathUtils.clamp(s.speed / pace, 0.5, 2.4);
      else if (s.cycle) a.timeScale = a.getClip().duration / s.cycle;
      else a.timeScale = key === 'die' || key === 'die2' ? 1.35 : 1;
    }
    // Sin animación de muerte: cae hacia atrás.
    if (s.falling && !this.has('die')) {
      this.fall = Math.min(1, this.fall + dt / 0.45);
      this.body.rotation.x = -this.fall * this.fall * 1.5;
    }
    this.mixer.update(dt);
    // Sin cabeza: el hueso se mantiene encogido aunque la animación lo mueva.
    if (this.headless && this.headBone) this.headBone.scale.setScalar(0.001);
    const flash = s.flash ?? 0;
    for (const m of this.mats) m.emissiveIntensity = flash;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
    for (const m of this.mats) m.dispose();
    this.root.removeFromParent();
  }
}
