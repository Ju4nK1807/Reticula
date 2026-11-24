// Personalización de las evaluaciones: valores válidos, qué da rango y qué es práctica, fases elegidas y
// cómo se aplica a las fases (cantidad, tamaño, velocidad, color, intentos, disparos enemigos).
import { describe, expect, it } from 'vitest';
import { EVAL_DEFAULTS, customChanges, evalConfig, isRanked, scaleBehavior, stagesFor } from '../src/modes/evaluation/evalConfig.js';
import { VARIANTS } from '../src/modes/evaluation/Evaluation.js';
import { SphereMultiPhase, SphereReactionPhase } from '../src/modes/evaluation/targetPhases.js';
import { DEFAULT_SETTINGS } from '../src/config/defaults.js';

const { targets, bots } = VARIANTS;

describe('configuración de la evaluación', () => {
  it('por defecto es la estándar: rifle, 3 a la vez, todo ×1, todas las fases y da rango', () => {
    const cfg = evalConfig(DEFAULT_SETTINGS.evaluation);
    expect(cfg).toEqual(EVAL_DEFAULTS);
    expect(cfg.weapon).toBe('rifle');
    expect(isRanked(targets, cfg)).toBe(true);
    expect(isRanked(bots, cfg)).toBe(true);
    expect(stagesFor(targets, cfg)).toHaveLength(5);
  });

  it('corrige valores fuera de rango, de otro tipo o armas que no existen', () => {
    const cfg = evalConfig({ weapon: 'bazooka', count: 99, size: -3, speed: 'rápido', duration: 37, targetColor: '#123456', skip: { targets: 'flick' } });
    expect(cfg.weapon).toBe('rifle');
    expect(cfg.count).toBe(8);
    expect(cfg.size).toBe(0.5);
    expect(cfg.speed).toBe(1);
    expect(cfg.duration).toBe(35); // pasos de 5 s
    expect(cfg.targetColor).toBe('auto');
    expect(cfg.skip.targets).toEqual([]);
  });

  it('los colores son solo estética: siguen dando rango', () => {
    expect(isRanked(targets, evalConfig({ targetColor: '#ffe14d' }))).toBe(true);
  });

  it('cambiar el arma, la cantidad, el tamaño, la velocidad o las fases la vuelve práctica (y dice qué cambió)', () => {
    for (const change of [{ weapon: 'sniper' }, { count: 5 }, { size: 1.5 }, { speed: 0.5 }, { duration: 60 }, { skip: { targets: ['tracking'] } }]) {
      const cfg = evalConfig(change);
      expect(isRanked(targets, cfg)).toBe(false);
      expect(customChanges(targets, cfg).length).toBeGreaterThan(0);
    }
    expect(customChanges(targets, evalConfig({ weapon: 'sniper' }))[0]).toContain('Francotirador');
    // Los intentos de reacción solo cuentan en Dianas; las asomadas y los disparos enemigos, en Enemigos.
    expect(isRanked(bots, evalConfig({ reactionTrials: 12 }))).toBe(true);
    expect(isRanked(targets, evalConfig({ enemyFire: 0 }))).toBe(true);
    expect(isRanked(bots, evalConfig({ enemyFire: 0 }))).toBe(false);
  });

  it('se juegan solo las fases elegidas; si se quitan todas, se juegan todas', () => {
    const some = stagesFor(targets, evalConfig({ skip: { targets: ['tracking', 'reaction'] } }));
    expect(some.map((S) => S.info.id)).toEqual(['flick', 'multi', 'precision']);
    const all = stagesFor(targets, evalConfig({ skip: { targets: targets.stages.map((S) => S.info.id) } }));
    expect(all).toHaveLength(5);
  });

  it('la velocidad escala los comportamientos de los enemigos', () => {
    const b = scaleBehavior({ type: 'peek', outSpeed: 4, hold: [0.6, 1], strafe: { speed: [2, 4] } }, 2);
    expect(b.outSpeed).toBe(8);
    expect(b.hold).toEqual([0.3, 0.5]);
    expect(b.strafe.speed).toEqual([4, 8]);
  });
});

describe('la configuración llega a las fases', () => {
  // Evaluación mínima: las fases solo leen ev.evalCfg y ev.game.
  const fakeEv = (evalCfg) => ({ evalCfg, game: { world: {}, ballistics: {}, settings: { enemyColor: '#ff3b4f' } }, root: null });

  it('intentos de reacción elegidos', () => {
    const phase = new SphereReactionPhase(fakeEv(evalConfig({ reactionTrials: 12 })));
    expect(phase.trials).toBe(12);
  });

  it('cantidad, tamaño y color de las dianas', () => {
    const phase = new SphereMultiPhase(fakeEv(evalConfig({ count: 5, size: 2, targetColor: '#ffffff' })));
    const spawned = [];
    phase.sphereSpot = () => ({ pos: { x: 0, y: 2, z: -10 }, angles: { yaw: 0, pitch: 0 } });
    phase.spawnSphere = function (opts) {
      // Lo mismo que Phase.spawnSphere hace con la configuración, sin crear la malla.
      const { size, targetColor } = this.evalCfg;
      spawned.push({ ...opts, radius: opts.radius * size, color: targetColor === 'auto' ? opts.color : targetColor });
      return {};
    };
    phase.begin();
    expect(spawned).toHaveLength(5);
    expect(spawned[0].radius).toBeCloseTo(0.7);
    expect(spawned[0].color).toBe('#ffffff');
  });
});
