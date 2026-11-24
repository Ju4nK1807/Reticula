import * as THREE from 'three';
import { createZombieMaterial, zombieDetail } from './zombieLook.js';
import { clownPieces, prepareClownKit } from './clownKit.js';

const BASE = `${import.meta.env?.BASE_URL ?? './'}models/characters/`;
const FILE = 'zombie.glb';
const FADE = 0.25;

const ANIM_FAR = 22;
const ANIM_FAR_STEP = 1 / 20;
const SHADOW_NEAR = 16;
const LOD_AT = { alta: [10, 24], media: [6, 16], baja: [4, 11] };
const LOD_NAMES = ['Zombie', 'Zombie_LOD1', 'Zombie_LOD2'];

export const ZOMBIE_CLIPS = ['idle', 'walk', 'fast', 'run', 'crawl', 'drag', 'attack', 'attack2', 'heavy', 'hit', 'scream', 'die', 'die2'];
const PACE = { walk: 0.55, fast: 1.9, run: 3.3, crawl: 2.1, drag: 0.7 };
const LOOP_ONCE = new Set(['die', 'die2', 'hit', 'scream']);
const POOL_MAX = 40;
const WOUND_BONES = /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot))$/;

const pool = [];
let template = null;

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _b = new THREE.Vector3();

export function loadZombieModel() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  template ??= (async () => {
    const [{ GLTFLoader }, SkeletonUtils] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
    const gltf = await new GLTFLoader().loadAsync(BASE + FILE);
    const clips = {};
    for (const key of ZOMBIE_CLIPS) {
      const clip = gltf.animations.find((a) => a.name === key);
      if (clip) clips[key] = clip;
    }
    const mixer = new THREE.AnimationMixer(gltf.scene);
    if (clips.idle) mixer.clipAction(clips.idle).play();
    mixer.update(0);
    gltf.scene.updateMatrixWorld(true);
    const height = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y || 1;
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
    const clown = prepareClownKit(gltf.scene);
    return { scene: gltf.scene, clips, height, clone: SkeletonUtils.clone, clown };
  })().catch(() => null);
  return template;
}

export function acquireZombieSkin(tpl, { height, kind = 'normal', bulk = 1 }) {
  const skin = pool.pop() ?? new ZombieSkin(tpl);
  skin.reset(height, kind, bulk);
  return skin;
}

export function prefillZombieSkin(tpl) {
  releaseZombieSkin(new ZombieSkin(tpl));
}

export function pooledZombieSkins() {
  return pool.length;
}

export function releaseZombieSkin(skin) {
  skin.root.removeFromParent();
  if (pool.length >= POOL_MAX) skin.dispose();
  else {
    skin.mixer.stopAllAction();
    pool.push(skin);
  }
}

export class ZombieSkin {
  constructor(tpl) {
    this.baseHeight = tpl.height;
    this.root = new THREE.Group();
    this.body = tpl.clone(tpl.scene);
    this.root.add(this.body);
    this.material = createZombieMaterial();
    this.look = this.material.look;
    this.lods = [];
    this.body.traverse((o) => {
      if (!o.isMesh) return;
      o.material = this.material;
      if (o.isSkinnedMesh) {
        o.geometry.computeBoundingSphere();
        o.boundingSphere = o.geometry.boundingSphere.clone();
        o.boundingSphere.radius *= 1.6;
      }
      o.castShadow = true;
    });
    for (const name of LOD_NAMES) {
      const m = this.body.getObjectByName(name);
      if (m?.isSkinnedMesh) this.lods.push(m);
    }
    if (!this.lods.length) this.body.traverse((o) => o.isSkinnedMesh && this.lods.push(o));
    this.mesh = this.lods[0];
    this.lod = -1;
    this.setLod(0);
    this.bones = {};
    this.body.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
    });
    this.headBone = this.bones.Head ?? null;
    this.clown = tpl.clown && this.headBone ? clownPieces(tpl.clown) : null;
    if (this.clown) {
      this.headBone.add(this.clown.head);
      if (this.clown.ruff) (this.bones.Neck ?? this.headBone).add(this.clown.ruff);
    }
    this.woundBones = Object.values(this.bones).filter((b) => WOUND_BONES.test(b.name));
    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {};
    for (const [k, clip] of Object.entries(tpl.clips)) {
      const a = this.mixer.clipAction(clip);
      if (LOOP_ONCE.has(k)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[k] = a;
    }
    this.shadow = true;
  }

  reset(height, kind = 'normal', bulk = 1) {
    this.mixer.stopAllAction();
    this.current = null;
    this.currentKey = null;
    this.fall = 0;
    this.animAcc = 0;
    this.size = height / 1.78;
    this.headless = false;
    this.legless = false;
    for (const b of Object.values(this.bones)) b.scale.set(1, 1, 1);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    const s = height / this.baseHeight;
    this.body.scale.set(s * bulk, s, s * bulk);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    this.material.emissiveIntensity = 0;
    const outfit = this.look.randomize(kind);
    this.clown?.pick(Math.random, outfit);
    this.play('idle', 0);
  }

  has(key) {
    return !!this.actions[key];
  }

  decapitate() {
    this.headless = true;
    this.headBone?.scale.setScalar(0.001);
  }

  amputateLegs() {
    this.legless = true;
    for (const n of ['LeftUpLeg', 'RightUpLeg']) this.bones[n]?.scale.setScalar(0.001);
  }

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

  headCenter(out) {
    if (!this.headBone || this.headless) return null;
    this.headBone.getWorldPosition(out);
    const top = this.bones.HeadTop_End;
    if (top) out.lerp(top.getWorldPosition(_b), 0.45);
    return out;
  }

  wound(world, radiusCm = 7) {
    if (!this.mesh) return;
    let best = null;
    let bestD = Infinity;
    for (const b of this.woundBones) {
      if (b.scale.x < 0.01) continue;
      const d = b.getWorldPosition(_b).distanceToSquared(world);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return;
    const skel = this.mesh.skeleton;
    const i = skel.bones.indexOf(best);
    if (i < 0) return;
    _m.multiplyMatrices(best.matrixWorld, skel.boneInverses[i]).multiply(this.mesh.bindMatrix).invert();
    _v.copy(world).applyMatrix4(_m);
    _b.setScalar(0).applyMatrix4(_m.multiplyMatrices(skel.boneInverses[i], this.mesh.bindMatrix).invert());
    const len = _v.distanceTo(_b);
    if (len > 12) _v.sub(_b).multiplyScalar(12 / len).add(_b);
    this.look.addWound(_v, radiusCm);
  }

  setLod(i) {
    const lod = Math.min(i, this.lods.length - 1);
    if (lod === this.lod) return;
    this.lod = lod;
    this.lods.forEach((m, k) => {
      m.visible = k === lod;
      m.castShadow = k === lod && this.shadow !== false;
    });
  }

  pickLod(d) {
    const [a, b] = LOD_AT[zombieDetail()] ?? LOD_AT.alta;
    const cur = this.lod;
    const up = (limit, level) => (cur >= level ? d > limit - 1 : d > limit + 1);
    return up(b, 2) ? 2 : up(a, 1) ? 1 : 0;
  }

  update(dt, s) {
    const dist = s.distance ?? 0;
    const far = dist > ANIM_FAR;
    const shadow = dist < SHADOW_NEAR;
    this.setLod(this.pickLod(dist));
    if (shadow !== this.shadow) {
      this.shadow = shadow;
      this.lods.forEach((m, k) => (m.castShadow = shadow && k === this.lod));
    }
    this.animAcc += dt;
    if (far && this.animAcc < ANIM_FAR_STEP && !s.falling) return;
    dt = this.animAcc;
    this.animAcc = 0;
    let key = s.anim;
    if (!this.has(key)) key = key === 'attack2' && this.has('attack') ? 'attack' : this.has('walk') ? 'walk' : 'idle';
    this.play(key);
    const a = this.current;
    if (a) {
      const pace = PACE[key] ? PACE[key] * (this.size ?? 1) : 0;
      if (pace && s.speed) a.timeScale = THREE.MathUtils.clamp(s.speed / pace, 0.45, 2.4);
      else if (s.cycle) a.timeScale = a.getClip().duration / s.cycle;
      else a.timeScale = key === 'die' || key === 'die2' ? 1.25 : 1;
    }
    this.mixer.update(dt);
    if (this.headless && this.headBone) this.headBone.scale.setScalar(0.001);
    if (this.legless) for (const n of ['LeftUpLeg', 'RightUpLeg']) this.bones[n]?.scale.setScalar(0.001);
    this.material.emissiveIntensity = s.flash ?? 0;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
    this.material.dispose();
    this.root.removeFromParent();
  }
}
