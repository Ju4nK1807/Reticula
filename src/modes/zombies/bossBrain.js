export const BOSS = {
  charge: { minDist: 6, maxDist: 22, windup: 0.9, speed: 10.5, maxTime: 1.6, every: [7, 10], damage: 1.2, knock: 10, dazed: 1.6 },
  slam: { range: 3.6, radius: 5.5, windup: 0.8, recover: 0.6, every: [6, 9], damage: 0.85, knock: 8 },
  summon: { at: [0.66, 0.33], count: 3, type: 'runner', roar: 1.4 },
  enrage: { at: 0.35, speed: 1.35, attackEvery: 0.75 },
};

const rand = (a, b) => a + Math.random() * (b - a);

export class BossBrain {
  constructor(zombie) {
    this.z = zombie;
    this.state = 'idle';
    this.t = 0;
    this.chargeCd = rand(3, 5);
    this.slamCd = rand(2.5, 4);
    this.summoned = 0;
    this.enraged = false;
    this.dir = { x: 0, z: 1 };
    this.anim = 'fast';
  }

  get busy() {
    return this.state !== 'idle';
  }

  update(dt, ctx, dist, dx, dz) {
    const z = this.z;
    const run = z.run;
    this.chargeCd -= dt;
    this.slamCd -= dt;
    this.t += dt;
    const life = z.hp / z.maxHp;

    if (!this.enraged && life <= BOSS.enrage.at) {
      this.enraged = true;
      z.stats = { ...z.stats, speed: z.stats.speed * BOSS.enrage.speed, attackEvery: z.stats.attackEvery * BOSS.enrage.attackEvery };
      run.bossAction?.('enrage', z);
    }

    if (this.state === 'idle') {
      if (z.state !== 'chase' || z.riseT > 0 || ctx.decoy) return false;
      if (this.summoned < BOSS.summon.at.length && life <= BOSS.summon.at[this.summoned]) {
        this.summoned++;
        return this.begin('summon', 'scream');
      }
      if (this.slamCd <= 0 && dist <= BOSS.slam.range) {
        this.slamCd = rand(...BOSS.slam.every);
        run.bossAction?.('slamWind', z);
        return this.begin('slamWind', 'heavy');
      }
      if (this.chargeCd <= 0 && dist >= BOSS.charge.minDist && dist <= BOSS.charge.maxDist && (run.nav?.clearLine?.(z.position.x, z.position.z, z.position.x + dx, z.position.z + dz) ?? true)) {
        this.chargeCd = rand(...BOSS.charge.every);
        run.bossAction?.('chargeWind', z);
        return this.begin('chargeWind', 'scream');
      }
      return false;
    }

    z.speedNow = 0;
    z.moveSpeed = 0;
    switch (this.state) {
      case 'summon':
        z.turnTowards(Math.atan2(dx, dz), dt);
        if (this.t >= BOSS.summon.roar * 0.35 && !this.done) {
          this.done = true;
          run.bossAction?.('summon', z, { count: BOSS.summon.count, type: BOSS.summon.type });
        }
        if (this.t >= BOSS.summon.roar) this.end();
        break;
      case 'chargeWind': {
        z.turnTowards(Math.atan2(dx, dz), dt * 2);
        if (this.t >= BOSS.charge.windup) {
          const d = Math.hypot(dx, dz) || 1;
          this.dir.x = dx / d;
          this.dir.z = dz / d;
          this.begin('charge', 'run');
          this.hit = false;
        }
        break;
      }
      case 'charge': {
        const p = z.position;
        const step = BOSS.charge.speed * dt;
        const x0 = p.x;
        const z0 = p.z;
        p.x += this.dir.x * step;
        p.z += this.dir.z * step;
        z.collideWorld(ctx.colliders);
        z.holdAtBarricade();
        z.moveSpeed = BOSS.charge.speed;
        z.yaw = Math.atan2(this.dir.x, this.dir.z);
        const moved = Math.hypot(p.x - x0, p.z - z0);
        const reach = z.stats.attackRange * Math.max(1, z.scale * 0.9) + 0.3;
        if (!this.hit && dist <= reach) {
          this.hit = true;
          run.bossAction?.('chargeHit', z, { dir: this.dir });
          this.end();
        } else if (moved < step * 0.35) {
          run.bossAction?.('crash', z);
          this.begin('dazed', 'hit');
        } else if (this.t >= BOSS.charge.maxTime) this.end();
        break;
      }
      case 'dazed':
        if (this.t >= BOSS.charge.dazed) this.end();
        break;
      case 'slamWind':
        z.turnTowards(Math.atan2(dx, dz), dt);
        if (this.t >= BOSS.slam.windup) {
          run.bossAction?.('slam', z, { radius: BOSS.slam.radius });
          this.begin('slamRecover', 'heavy');
        }
        break;
      case 'slamRecover':
        if (this.t >= BOSS.slam.recover) this.end();
        break;
    }
    return true;
  }

  begin(state, anim) {
    this.state = state;
    this.anim = anim;
    this.t = 0;
    this.done = false;
    return true;
  }

  end() {
    this.state = 'idle';
    this.anim = 'fast';
    this.t = 0;
    this.z.heading = null;
  }
}
