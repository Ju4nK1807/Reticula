import * as THREE from 'three';
import { castsShadow } from '../gfx/lighting.js';

/*
  Apariencia de los enemigos: soldado animado (Quaternius, CC0; ver public/models/characters/credits.json).

  Es SOLO visual: las hitboxes de cajas de Bot siguen decidiendo los impactos (quedan invisibles), así
  la puntería y los rangos no cambian. El soldado:
  - se clona por bot (esqueleto propio) y se anima con un AnimationMixer: apuntar, disparar, correr
    hacia delante, atrás y a los lados, y morir, con transiciones suaves;
  - se agacha bajando la cadera y doblando las piernas (el modelo no trae esa animación);
  - lleva el color de enemigo de la configuración en el uniforme y un arma en la mano derecha;
  - destella al recibir daño (emisivo), como el modelo de cajas.
  Mientras carga (o si falla) se ve el modelo de cajas.
*/

const BASE = `${import.meta.env?.BASE_URL ?? './'}models/`;
const FADE = 0.18; // s de transición entre animaciones
const RUN_CLIP_SPEED = 4.2; // m/s a los que el ciclo de carrera se ve natural
const IDLE_SPEED = 0.35; // por debajo, parado

const CLIPS = {
  idle: 'Idle_Gun_Pointing',
  shoot: 'Idle_Gun_Shoot',
  run: 'Run',
  back: 'Run_Back',
  left: 'Run_Left',
  right: 'Run_Right',
  death: 'Death',
};

// Esfera de recorte en el espacio de la malla (unidades del modelo): centro a media altura, radio que
// alcanza al soldado tendido en el suelo al morir.
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.9);
const ANIM_FAR = 28; // m: más lejos, la animación se actualiza a 20 Hz (no se nota y ahorra CPU)
const ANIM_FAR_STEP = 1 / 20;
const CROUCH_DROP = 0.55; // m que baja la cadera agachado: la cabeza visible coincide con su hitbox
const _a = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Gira un hueso (en el mundo) para que el punto `from` (que hoy cuelga de él) pase a apuntar a `to`.
export function aimBone(bone, from, to, pivot = bone.getWorldPosition(new THREE.Vector3())) {
  const cur = new THREE.Vector3().subVectors(from, pivot).normalize();
  const want = new THREE.Vector3().subVectors(to, pivot).normalize();
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(cur, want);
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(delta.multiply(world)));
  bone.updateWorldMatrix(false, true);
}

// Geometría lista para unir: solo posición, normal y piel, más un color por vértice (el del material).
function bakeColor(geometry, color, keepSkin) {
  const g = new THREE.BufferGeometry();
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  g.setAttribute('position', src.attributes.position.clone());
  if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
  else g.computeVertexNormals();
  if (keepSkin) {
    const si = src.attributes.skinIndex;
    const idx = new Uint16Array(si.count * 4);
    for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) idx[i * 4 + k] = si.getComponent(i, k);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    const sw = src.attributes.skinWeight;
    const w = new Float32Array(sw.count * 4);
    for (let i = 0; i < sw.count; i++) for (let k = 0; k < 4; k++) w[i * 4 + k] = sw.getComponent(i, k);
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
  }
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}

// Une todas las mallas con piel del soldado en UNA sola (colores en los vértices): una llamada de
// dibujo por enemigo en vez de nueve. El uniforme ("Swat") toma el color de enemigo.
async function mergeSoldier(scene, tint) {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const skinned = [];
  scene.traverse((o) => o.isSkinnedMesh && skinned.push(o));
  if (skinned.length < 2) return false;
  const first = skinned[0];
  const bones = first.skeleton.bones;
  const compatible = skinned.every((m) => m.bindMatrix.equals(first.bindMatrix) && m.skeleton.bones.length === bones.length && m.skeleton.bones.every((b, i) => b === bones[i]));
  if (!compatible) return false;
  const geos = skinned.map((m) => bakeColor(m.geometry, m.material.name === 'Swat' ? tint : m.material.color, true));
  const merged = mergeGeometries(geos, false);
  if (!merged) return false;
  const mesh = new THREE.SkinnedMesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12, flatShading: true }));
  mesh.name = 'Soldier';
  first.parent.add(mesh);
  mesh.bind(first.skeleton, first.bindMatrix);
  for (const m of skinned) m.removeFromParent();
  return true;
}

// Arma de la mano en una sola malla (colores en los vértices).
async function mergeGun(root) {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  root.updateMatrixWorld(true);
  const geos = [];
  root.traverse((o) => {
    if (o.isMesh) geos.push(bakeColor(o.geometry, o.material.color, false).applyMatrix4(o.matrixWorld));
  });
  const merged = geos.length ? mergeGeometries(geos, false) : null;
  if (!merged) return root;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55, flatShading: true })));
  return group;
}

let basePromise = null;
const templates = new Map(); // color → Promise<template>

function loadBase() {
  basePromise ??= (async () => {
    const [{ GLTFLoader }, SkeletonUtils] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
    const loader = new GLTFLoader();
    const [soldier, gun] = await Promise.all([loader.loadAsync(`${BASE}characters/soldier.glb`), loader.loadAsync(`${BASE}weapons/pistol.glb`).catch(() => null)]);
    const clips = {};
    for (const [key, name] of Object.entries(CLIPS)) {
      const clip = soldier.animations.find((a) => a.name.endsWith(`|${name}`) || a.name === name);
      if (clip) clips[key] = clip;
    }
    if (!clips.idle || !clips.run) return null;
    // Arma para la mano: la pose de apuntar es a una mano, así que lleva la pistola (escala real).
    let gunTemplate = null;
    if (gun) {
      const { fitWeaponModel } = await import('../combat/weaponModels.js');
      const holder = new THREE.Group();
      holder.add(gun.scene);
      fitWeaponModel(gun.scene, { scale: 1, back: 0.06, top: 0.04 });
      gunTemplate = await mergeGun(holder);
    }
    return { scene: soldier.scene, clips, gun: gunTemplate, clone: SkeletonUtils.clone };
  })().catch(() => null);
  return basePromise;
}

/** Soldado listo para clonar con el color de enemigo dado (se prepara una vez por color). */
export function loadSoldier(color = '#ff3b4f') {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const key = new THREE.Color(color).getHexString();
  if (!templates.has(key)) {
    templates.set(
      key,
      loadBase()
        .then(async (base) => {
          if (!base) return null;
          const scene = base.clone(base.scene);
          const tint = new THREE.Color(color).multiplyScalar(0.8);
          await mergeSoldier(scene, tint);
          return { ...base, scene };
        })
        .catch(() => null),
    );
  }
  return templates.get(key);
}

// Reserva de soldados ya creados, por color de enemigo. Crear uno cuesta: clonar 62 huesos, armar el
// mezclador (~400 enlaces de animación) y su textura de huesos. Al morir un bot su soldado vuelve aquí
// y el siguiente lo reutiliza: aparecer un enemigo deja de producir tirones.
const POOL_MAX = 24;
const pool = new Map(); // color → BotSkin[]

/** Soldado listo para usar: de la reserva si hay, si no uno nuevo. */
export function acquireSkin(template, color) {
  const skin = pool.get(color)?.pop();
  if (skin) {
    skin.reset();
    return skin;
  }
  return new BotSkin(template, color);
}

/** Devuelve un soldado a la reserva (o lo libera si ya hay suficientes). */
export function releaseSkin(skin) {
  skin.root.removeFromParent();
  const list = pool.get(skin.color) ?? [];
  pool.set(skin.color, list);
  if (list.length >= POOL_MAX) skin.dispose();
  else {
    skin.mixer.stopAllAction();
    list.push(skin);
  }
}

/** Cantidad de soldados en reserva de un color (para precargar en el menú). */
export function pooledSkins(color) {
  return pool.get(color)?.length ?? 0;
}

export class BotSkin {
  constructor(template, color) {
    this.color = color;
    this.root = template.clone(template.scene);
    // Recorte por frustum con una esfera fija y holgada (cubre correr, agacharse y caer): los
    // soldados fuera de cámara no se dibujan, tampoco en el pase de sombras. La esfera calculada por
    // Three.js sería la de una sola pose y además cuesta calcularla con la piel.
    this.root.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.boundingSphere = BOUNDS.clone();
        o.frustumCulled = true;
      } else if (o.isMesh) o.frustumCulled = false; // el arma va dentro de la esfera del soldado
    });

    // Materiales propios del bot (para el destello al recibir daño). Si no se pudo unir el soldado en
    // una malla, el uniforme ("Swat") se tiñe aquí con el color de enemigo.
    this.mats = [];
    const tint = new THREE.Color(color);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone();
      if (m.name === 'Swat') m.color.copy(tint).multiplyScalar(0.8);
      m.emissive = new THREE.Color('#ffffff');
      m.emissiveIntensity = 0;
      o.material = m;
      this.mats.push(m);
    });

    this.bones = {};
    this.root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
    });

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const [key, clip] of Object.entries(template.clips)) this.actions[key] = this.mixer.clipAction(clip);
    const death = this.actions.death;
    if (death) {
      death.setLoop(THREE.LoopOnce, 1);
      death.clampWhenFinished = true;
    }
    this.current = null;
    this.play('idle', 0);
    this.mixer.update(0);
    // Huesos que modifica el agachado: se guarda su pose limpia (la del mixer) y se restaura antes
    // de cada cuadro, así nada se acumula aunque la animación activa no los mueva.
    this.root.updateMatrixWorld(true);
    this.poseBones = ['Body', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR'].map((n) => this.bones[n]).filter(Boolean);
    this.cleanPose = this.poseBones.map((bone) => ({
      bone,
      pos: bone.position.clone(),
      quat: bone.quaternion.clone(),
      rest: { pos: bone.position.clone(), quat: bone.quaternion.clone() }, // pose inicial (reset)
    }));
    // Tibia en reposo: vector rodilla → pie en el espacio del hueso de la pierna (para la IK).
    this.shin = {};
    for (const side of ['L', 'R']) {
      const lower = this.bones[`LowerLeg${side}`];
      const foot = this.bones[`Foot${side}`];
      if (lower && foot) {
        const F = foot.getWorldPosition(new THREE.Vector3());
        this.shin[side] = { local: lower.worldToLocal(F.clone()), length: lower.getWorldPosition(new THREE.Vector3()).distanceTo(F) };
      }
    }

    // Arma en la mano derecha, orientada con la pose de apuntar: cañón hacia +Z del soldado.
    const wrist = this.bones.WristR;
    if (template.gun && wrist) this.attachGun(template.gun.clone(true), wrist);
    castsShadow(this.root);
  }

  attachGun(gun, wrist) {
    this.root.updateMatrixWorld(true);
    const wq = wrist.getWorldQuaternion(new THREE.Quaternion());
    const ws = wrist.getWorldScale(new THREE.Vector3());
    // Rotación deseada en el mundo: los modelos de arma miran a -Z; el soldado apunta hacia +Z.
    const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    this.gun = new THREE.Group();
    this.gun.add(gun);
    this.gun.quaternion.copy(wq.invert().multiply(want));
    this.gun.scale.setScalar(1 / (ws.x || 1));
    // La empuñadura (algo por delante de la culata) queda en la mano.
    this.gun.position.set(0, 0, 0);
    gun.position.set(0, -0.02, -0.02);
    wrist.add(this.gun);
  }

  play(key, fade = FADE) {
    const next = this.actions[key] ?? this.actions.idle;
    if (this.current === next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
  }

  /**
   * @param {number} dt
   * @param {{ lateral: number, forward: number, speed: number, crouch: number, shotT: number, dying: boolean, flash: number }} s
   */
  update(dt, s) {
    // Nivel de detalle de la animación: de lejos se acumula el tiempo y se actualiza a 20 Hz.
    this.animAcc = (this.animAcc ?? 0) + dt;
    if ((s.distance ?? 0) > ANIM_FAR && this.animAcc < ANIM_FAR_STEP && !s.dying) {
      for (const m of this.mats) m.emissiveIntensity = s.flash;
      return;
    }
    dt = this.animAcc;
    this.animAcc = 0;
    if (s.dying) {
      this.play('death', 0.1);
      this.actions.death && (this.actions.death.timeScale = 1.4);
    } else if (s.speed < IDLE_SPEED) {
      this.play(s.shotT < 0.3 && this.actions.shoot ? 'shoot' : 'idle');
    } else {
      const lateral = Math.abs(s.lateral) > Math.abs(s.forward);
      // +X del modelo es su izquierda (apunta con el brazo derecho, que queda en -X).
      const key = lateral ? (s.lateral > 0 ? 'left' : 'right') : s.forward >= 0 ? 'run' : 'back';
      this.play(key);
      this.current.timeScale = THREE.MathUtils.clamp(s.speed / RUN_CLIP_SPEED, 0.6, 1.5);
    }
    for (const p of this.cleanPose) {
      p.bone.position.copy(p.pos);
      p.bone.quaternion.copy(p.quat);
    }
    this.mixer.update(dt);
    for (const p of this.cleanPose) {
      p.pos.copy(p.bone.position);
      p.quat.copy(p.bone.quaternion);
    }
    this.applyCrouch(s.crouch);
    for (const m of this.mats) m.emissiveIntensity = s.flash;
  }

  // Agacharse: baja la cadera (en metros del mundo) y dobla las piernas con IK de dos huesos para
  // que las rodillas vayan hacia delante y los pies sigan en el suelo. Se aplica tras el mixer.
  applyCrouch(c) {
    const b = this.bones;
    if (c < 0.01 || !b.Body) return;
    const scale = this.root.parent ? this.root.parent.getWorldScale(_s).y : 1;
    b.Body.parent.updateWorldMatrix(true, false);
    const hip = b.Body.getWorldPosition(_a);
    hip.y -= CROUCH_DROP * c * scale;
    b.Body.position.copy(b.Body.parent.worldToLocal(hip));
    b.Body.updateWorldMatrix(false, true);
    for (const side of ['L', 'R']) this.legIK(b[`UpperLeg${side}`], b[`LowerLeg${side}`], b[`Foot${side}`], this.shin[side]);
  }

  // IK analítico: con cadera H, pie F y largos de muslo y pierna, ubica la rodilla K hacia delante
  // del soldado y orienta los dos huesos para que pasen por K y por F.
  legIK(upper, lower, foot, shin) {
    if (!upper || !lower || !foot || !shin) return;
    upper.updateWorldMatrix(true, false);
    const H = upper.getWorldPosition(new THREE.Vector3());
    const K0 = lower.getWorldPosition(new THREE.Vector3());
    const F = foot.getWorldPosition(new THREE.Vector3());
    const scale = this.root.parent ? this.root.parent.getWorldScale(_s).y : 1;
    const a = H.distanceTo(K0);
    const bLen = shin.length * scale;
    const d = Math.min(H.distanceTo(F), a + bLen - 1e-4);
    const toFoot = new THREE.Vector3().subVectors(F, H).normalize();
    // Dirección "adelante" del soldado: la rodilla se dobla hacia ahí.
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(_q));
    const side = new THREE.Vector3().crossVectors(toFoot, fwd).normalize();
    const bend = new THREE.Vector3().crossVectors(side, toFoot).normalize();
    const along = (a * a - bLen * bLen + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, a * a - along * along));
    const K = H.clone().addScaledVector(toFoot, along).addScaledVector(bend, h);
    aimBone(upper, K0, K);
    const shinEnd = lower.localToWorld(shin.local.clone());
    aimBone(lower, shinEnd, F);
  }

  // Deja el soldado como recién creado (al sacarlo de la reserva).
  reset() {
    this.mixer.stopAllAction();
    this.current = null;
    this.animAcc = 0;
    for (const p of this.cleanPose) {
      p.bone.position.copy(p.rest.pos);
      p.bone.quaternion.copy(p.rest.quat);
      p.pos.copy(p.rest.pos);
      p.quat.copy(p.rest.quat);
    }
    for (const m of this.mats) m.emissiveIntensity = 0;
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.root.scale.set(1, 1, 1);
    this.play('idle', 0);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const m of this.mats) m.dispose();
    this.root.removeFromParent();
  }
}
