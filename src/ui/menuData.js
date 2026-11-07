// Datos del menú principal a partir del guardado: el "siguiente paso" recomendado y el dato que
// muestra cada modo. Funciones puras (probadas en tests/menuData.test.js).
import { getRank } from '../config/ranks.js';
import { CAMPAIGN_MAPS, levelsOf } from '../modes/campaign/campaignData.js';
import { campaignSummary } from '../stats/history.js';
import { recommendedMap } from '../modes/campaign/progress.js';

const DAY = 864e5;
export const STALE_EVALUATION_DAYS = 7;

// Resumen de una línea para cada modo (o null si no hay nada que contar).
export function modeSummary(id, data) {
  const variants = data.profile?.variants ?? {};
  switch (id) {
    case 'evaluation-targets':
    case 'evaluation-bots': {
      const v = variants[id === 'evaluation-targets' ? 'targets' : 'bots'];
      const rank = getRank(v?.rank);
      return rank ? { text: `${rank.name} · ${v.score}`, color: rank.color, sub: `récord ${v.best}` } : { text: 'Sin evaluar', sub: '≈ 3 min · 5 fases' };
    }
    case 'campaign': {
      const maps = campaignSummary(data);
      const stars = maps.reduce((s, m) => s + m.stars, 0);
      const max = maps.reduce((s, m) => s + m.max, 0);
      return { text: `★ ${stars}/${max}`, sub: `${maps.filter((m) => m.completed).length}/${maps.length} mapas` };
    }
    case 'story': {
      const s = data.records?.story;
      const done = Object.keys(s?.completed ?? {}).length;
      return s?.finished ? { text: 'Completada', sub: '8/8 capítulos' } : done ? { text: `Capítulo ${done + 1}`, sub: `${done}/8 completados` } : { text: 'Sin empezar', sub: '8 capítulos' };
    }
    case 'coordination': {
      const c = data.records?.coordination?.circuit;
      return c?.plays ? { text: `Índice ${c.best}`, sub: `${c.plays} circuitos` } : { text: 'Sin jugar', sub: '4 ejercicios · 45 s' };
    }
    case 'zombie-defense': {
      const z = data.records?.['zombie-defense'];
      return z?.totalRuns ? { text: `Oleada ${z.bestWave}`, sub: `récord · ${z.bestScore} pts` } : { text: 'Sin jugar', sub: 'protege la barra' };
    }
    case 'zombies': {
      const z = data.records?.zombies;
      return z?.totalRuns ? { text: `Oleada ${z.bestWave}`, sub: `récord · ${z.bestScore} pts` } : { text: 'Sin jugar', sub: 'hasta caer' };
    }
    case 'endless': {
      const e = data.records?.endless;
      return e?.totalRuns ? { text: `Oleada ${e.bestWave}`, sub: `récord · ${e.bestScore} pts` } : { text: 'Sin jugar', sub: 'hasta caer' };
    }
    default:
      return null;
  }
}

// Primer nivel de campaña abierto y sin estrellas, empezando por el mapa recomendado para el rango.
function nextCampaignLevel(data) {
  const best = data.campaign?.best ?? {};
  const start = CAMPAIGN_MAPS.indexOf(recommendedMap(data.profile?.rank));
  for (const map of CAMPAIGN_MAPS.slice(Math.max(0, start))) {
    const levels = levelsOf(map.id);
    for (let i = 0; i < levels.length; i++) {
      const prevOk = i === 0 || (best[levels[i - 1].id]?.stars ?? 0) >= 1;
      if (!prevOk) break;
      if ((best[levels[i].id]?.stars ?? 0) === 0) return { map, level: levels[i] };
    }
  }
  return null;
}

/*
  Siguiente paso recomendado: lo más útil que puede hacer el jugador ahora.
  1. Sin evaluación → hacer la de dianas (da el rango y desbloquea modos).
  2. Le falta una de las dos variantes → completarla.
  3. Evaluación de hace más de una semana → reevaluar.
  4. Campaña con un nivel pendiente → continuarla.
  5. Si no, batir el récord del modo infinito.
*/
export function nextStep(data, now = Date.now()) {
  const v = data.profile?.variants ?? {};
  if (!v.targets && !v.bots) {
    return { modeId: 'evaluation-targets', eyebrow: 'Empieza aquí', title: 'Descubre tu rango', desc: 'Una evaluación de 5 fases (unos 3 minutos) mide flicking, tracking, reacción y precisión. Con ella se abren la campaña y el modo infinito.', cta: 'Hacer la evaluación' };
  }
  if (!v.targets || !v.bots) {
    const missing = v.targets ? 'bots' : 'targets';
    return {
      modeId: `evaluation-${missing}`,
      eyebrow: 'Completa tu perfil',
      title: missing === 'bots' ? 'Evalúate contra enemigos' : 'Evalúate con dianas',
      desc: missing === 'bots' ? 'Bots de tamaño real que se cubren, se asoman y te disparan. Tu rango general es el mejor de las dos evaluaciones.' : 'La evaluación clásica de aim trainer: flicking, tracking, reacción, multi-objetivo y precisión.',
      cta: 'Comenzar',
    };
  }
  const last = Math.max(...Object.values(v).map((x) => Date.parse(x.date) || 0));
  if (last && now - last > STALE_EVALUATION_DAYS * DAY) {
    const days = Math.floor((now - last) / DAY);
    return { modeId: 'evaluation-targets', eyebrow: 'Mide tu progreso', title: 'Reevalúa tu rango', desc: `Tu última evaluación fue hace ${days} días. Repítela para ver cuánto has mejorado.`, cta: 'Reevaluar' };
  }
  const next = nextCampaignLevel(data);
  if (next) {
    return {
      modeId: 'campaign',
      eyebrow: `Campaña · ${next.map.name}`,
      title: `Nivel ${next.level.number}: ${next.level.name}`,
      desc: `${next.level.kind} · ${next.level.total} enemigos · meta ★ ${next.level.goals[0]}. ${next.level.desc}`,
      cta: 'Continuar campaña',
    };
  }
  const wave = data.records?.endless?.bestWave ?? 0;
  return { modeId: 'endless', eyebrow: 'Reto', title: wave ? `Supera la oleada ${wave}` : 'Prueba el modo infinito', desc: 'Oleadas sin fin en el Bastión, cada vez más rápidas y pequeñas. Hasta caer.', cta: 'Jugar' };
}
