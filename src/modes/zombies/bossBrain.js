/*
  Ataques especiales del Jefe. El zombi le cede el control mientras hace uno (Zombie.update): el
  resto del tiempo persigue y pega como cualquier otro, pero más fuerte.

  - Embestida: de lejos (y con la recta despejada) se planta, ruge y carga en línea recta a gran
    velocidad. Si te alcanza, pega fuerte y te lanza por el aire; si choca contra una pared, queda
    aturdido un momento (la ocasión para dispararle a la cabeza). Se esquiva saliéndose de su línea.
  - Pisotón: de cerca, levanta los brazos y golpea el suelo: una onda que daña y empuja a todo lo que
    esté a pocos metros. Se esquiva alejándose a tiempo o saltando justo antes del golpe.
  - Llamado: a 2/3 y a 1/3 de su vida ruge y salen corredores de la tierra a su alrededor.
  - Furia: con poca vida camina más rápido y pega más seguido (los ojos le brillan más).

  Los efectos sobre el jugador y el mapa los aplica la partida (ZombieRun.bossAction).
*/
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
    this.state = 'idle'; // idle · chargeWind · charge · dazed · slamWind · slamRecover · summon
    this.t = 0;
    this.chargeCd = rand(3, 5); // el primero llega pronto
    this.slamCd = rand(2.5, 4);
    this.summoned = 0;
    this.enraged = false;
    this.dir = { x: 0, z: 1 };
    this.anim = 'fast';
  }

  get busy() {
    return this.state !== 'idle';
  }

  /**
   * dist: distancia al jugador; dx, dz: hacia el jugador. Devuelve true si este cuadro lo maneja el
   * cerebro (el zombi no persigue ni ataca por su cuenta).
   */
  update(dt, ctx, dist, dx, dz) {
    const z = this.z;
    const run = z.run;
    this.chargeCd -= dt;
    this.slamCd -= dt;
    this.t += dt;
    const life = z.hp / z.maxHp;

    // Furia (una vez).
    if (!this.enraged && life <= BOSS.enrage.at) {
      this.enraged = true;
      z.stats = { ...z.stats, speed: z.stats.speed * BOSS.enrage.speed, attackEvery: z.stats.attackEvery * BOSS.enrage.attackEvery };
      run.bossAction?.('enrage', z);
    }

    if (this.state === 'idle') {
      // Solo empieza un ataque especial persiguiendo (no a mitad de un zarpazo) y ya fuera del suelo.
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
        // Apunta mientras ruge; al final fija la dirección (se esquiva moviéndose de costado).
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
        z.holdAtBarricade(); // los tablones lo frenan como a todos
        z.moveSpeed = BOSS.charge.speed;
        z.yaw = Math.atan2(this.dir.x, this.dir.z);
        const moved = Math.hypot(p.x - x0, p.z - z0);
        const reach = z.stats.attackRange * Math.max(1, z.scale * 0.9) + 0.3;
        if (!this.hit && dist <= reach) {
          this.hit = true;
          run.bossAction?.('chargeHit', z, { dir: this.dir });
          this.end();
        } else if (moved < step * 0.35) {
          // Se estrelló contra una pared: queda aturdido.
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
    this.z.heading = null; // vuelve a perseguir desde donde quedó
  }
}
