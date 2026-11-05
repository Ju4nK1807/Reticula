import { describe, expect, it } from 'vitest';
import { MAX_HISTORY_PER_VARIANT, overallRank, recordEvaluation, refreshProfile } from '../src/storage/profile.js';
import { DEFAULT_SAVE } from '../src/config/defaults.js';

const freshProfile = () => structuredClone(DEFAULT_SAVE.profile);
const summary = (variant, total, rank) => ({ variant, total, rank, subscores: {}, tiles: [] });

describe('overallRank', () => {
  it('es null sin evaluaciones', () => {
    expect(overallRank({})).toBeNull();
    expect(overallRank(undefined)).toBeNull();
  });

  it('elige el mejor rango actual entre variantes', () => {
    expect(overallRank({ targets: { rank: 'plata' }, bots: { rank: 'diamante' } }).id).toBe('diamante');
  });

  it('ignora rangos desconocidos', () => {
    expect(overallRank({ targets: { rank: 'leyenda' }, bots: { rank: 'oro' } }).id).toBe('oro');
  });
});

describe('recordEvaluation', () => {
  it('guarda la variante, recalcula el perfil y devuelve la anterior', () => {
    const p = freshProfile();
    expect(recordEvaluation(p, 'targets', summary('targets', 40, 'plata'), {})).toBeNull();
    const prev = recordEvaluation(p, 'targets', summary('targets', 50, 'oro'), {});
    expect(prev.total).toBe(40);
    expect(p.variants.targets).toMatchObject({ rank: 'oro', score: 50, best: 50 });
    expect(p.rank).toBe('oro');
  });

  it('una evaluación peor en otra variante no baja el rango general', () => {
    const p = freshProfile();
    recordEvaluation(p, 'targets', summary('targets', 70, 'diamante'), {});
    recordEvaluation(p, 'bots', summary('bots', 10, 'bronce'), {});
    expect(p.rank).toBe('diamante');
    expect(p.score).toBe(70);
  });

  it('el récord de la variante no baja aunque el rango actual sí', () => {
    const p = freshProfile();
    recordEvaluation(p, 'bots', summary('bots', 60, 'oro'), {});
    recordEvaluation(p, 'bots', summary('bots', 20, 'bronce'), {});
    expect(p.variants.bots.best).toBe(60);
    expect(p.variants.bots.rank).toBe('bronce');
    expect(p.bestScore).toBe(60);
  });

  it('limita el historial por variante sin borrar el de la otra', () => {
    const p = freshProfile();
    recordEvaluation(p, 'bots', summary('bots', 30, 'plata'), {});
    for (let i = 0; i < MAX_HISTORY_PER_VARIANT + 5; i++) {
      recordEvaluation(p, 'targets', summary('targets', i, 'bronce'), {});
    }
    expect(p.evaluations.filter((e) => e.variant === 'targets')).toHaveLength(MAX_HISTORY_PER_VARIANT);
    expect(p.evaluations.filter((e) => e.variant === 'bots')).toHaveLength(1);
    expect(p.evaluations.at(-1).total).toBe(MAX_HISTORY_PER_VARIANT + 4);
  });

  it('refreshProfile deja todo en null sin variantes', () => {
    expect(refreshProfile({ variants: {} })).toMatchObject({ rank: null, score: null, bestScore: null });
  });
});
