import * as THREE from 'three';
import { castsShadow } from '../gfx/lighting.js';

const BASE = `${import.meta.env?.BASE_URL ?? './'}models/`;
const FADE = 0.18;
const RUN_CLIP_SPEED = 4.2;
const IDLE_SPEED = 0.35;

const CLIPS = {
  idle: 'Idle_Gun_Pointing',
  shoot: 'Idle_Gun_Shoot',
  run: 'Run',
  back: 'Run_Back',
  left: 'Run_Left',
  right: 'Run_Right',
  death: 'Death',
  rest: 'Idle_Gun',
  neutral: 'Idle_Neutral',
};

const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.9);
const ANIM_FAR = 28;
const ANIM_FAR_STEP = 1 / 20;
const CROUCH_DROP = 0.55;
const _a = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();

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
const templates = new Map();

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

export function loadSoldier(color = '#ff3b4f', { parts = false } = {}) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const key = `${new THREE.Color(color).getHexString()}${parts ? '|piezas' : ''}`;
  if (!templates.has(key)) {
    templates.set(
      key,
      loadBase()
        .then(async (base) => {
          if (!base) return null;
          const scene = base.clone(base.scene);
          const tint = new THREE.Color(color).multiplyScalar(0.8);
          if (!parts) await mergeSoldier(scene, tint);
          return { ...base, scene };
        })
        .catch(() => null),
    );
  }
  return templates.get(key);
}

const POOL_MAX = 24;
const pool = new Map();

export function acquireSkin(template, color) {
  const skin = pool.get(color)?.pop();
  if (skin) {
    skin.reset();
    return skin;
  }
  return new BotSkin(template, color);
}

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

export function pooledSkins(color) {
  return pool.get(color)?.length ?? 0;
}

export class BotSkin {
  constructor(template, color) {
    this.color = color;
    this.root = template.clone(template.scene);
    this.root.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.boundingSphere = BOUNDS.clone();
        o.frustumCulled = true;
      } else if (o.isMesh) o.frustumCulled = false;
    });

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
    this.root.updateMatrixWorld(true);
    this.poseBones = ['Body', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR'].map((n) => this.bones[n]).filter(Boolean);
    this.cleanPose = this.poseBones.map((bone) => ({
      bone,
      pos: bone.position.clone(),
      quat: bone.quaternion.clone(),
      rest: { pos: bone.position.clone(), quat: bone.quaternion.clone() },
    }));
    this.shin = {};
    for (const side of ['L', 'R']) {
      const lower = this.bones[`LowerLeg${side}`];
      const foot = this.bones[`Foot${side}`];
      if (lower && foot) {
        const F = foot.getWorldPosition(new THREE.Vector3());
        this.shin[side] = { local: lower.worldToLocal(F.clone()), length: lower.getWorldPosition(new THREE.Vector3()).distanceTo(F) };
      }
    }

    const wrist = this.bones.WristR;
    if (template.gun && wrist) this.attachGun(template.gun.clone(true), wrist);
    castsShadow(this.root);
  }

  attachGun(gun, wrist) {
    this.root.updateMatrixWorld(true);
    const wq = wrist.getWorldQuaternion(new THREE.Quaternion());
    const ws = wrist.getWorldScale(new THREE.Vector3());
    const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    this.gun = new THREE.Group();
    this.gun.add(gun);
    this.gun.quaternion.copy(wq.invert().multiply(want));
    this.gun.scale.setScalar(1 / (ws.x || 1));
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

  update(dt, s) {
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
