import { describe, expect, it } from 'vitest';
import {
  GameSessionFactory,
  type EnvironmentSnapshot,
  type GameSession,
  type SpaceWeatherEvent,
} from '../src/index.js';
import { planSpaceWeather, SPACE_WEATHER_FLAGS } from '../src/systems/space-weather-planner.js';
import { labBundle, labNode, type LabOptions } from './lab.js';
import { loadMini } from './helpers.js';

const config = loadMini().config.spaceWeather;

function event(overrides: Partial<SpaceWeatherEvent> = {}): SpaceWeatherEvent {
  return {
    id: 'cme-1',
    source: 'NASA_DONKI',
    type: 'cme',
    timestamp: '2026-11-10T00:00:00.000Z',
    severity: 0.5,
    eligibleWorlds: ['moon', 'mars'],
    ...overrides,
  };
}

function environment(...spaceWeather: SpaceWeatherEvent[]): EnvironmentSnapshot {
  return { createdAt: '2026-11-15T00:00:00.000Z', spaceWeather };
}

describe('planSpaceWeather', () => {
  it('plans nothing without an environment or without relevant activity', () => {
    expect(planSpaceWeather(undefined, 'moon', config)).toBeUndefined();
    expect(planSpaceWeather(environment(), 'moon', config)).toBeUndefined();
    const quiet = event({ severity: config.minSeverity - 0.01 });
    expect(planSpaceWeather(environment(quiet), 'moon', config)).toBeUndefined();
  });

  it('accepts severity exactly at the minimum', () => {
    const plan = planSpaceWeather(
      environment(event({ severity: config.minSeverity })),
      'moon',
      config,
    );
    expect(plan?.cardId).toBe(config.cards['moon']);
    expect(plan?.day).toBe(config.triggerDay);
  });

  it('ignores events that are not eligible for the world', () => {
    const moonOnly = event({ eligibleWorlds: ['moon'] });
    expect(planSpaceWeather(environment(moonOnly), 'mars', config)).toBeUndefined();
  });

  it('flags the activity type, and strong events at the strong threshold', () => {
    const flare = event({ type: 'solar-flare', severity: config.strongSeverity });
    expect(planSpaceWeather(environment(flare), 'mars', config)?.flags).toEqual([
      SPACE_WEATHER_FLAGS.flare,
      SPACE_WEATHER_FLAGS.strong,
    ]);
    const mild = event({ severity: config.strongSeverity - 0.01 });
    expect(planSpaceWeather(environment(mild), 'mars', config)?.flags).toEqual([
      SPACE_WEATHER_FLAGS.cme,
    ]);
  });

  it('picks the most severe event regardless of input order, breaking ties by id', () => {
    const a = event({ id: 'a', type: 'solar-flare', severity: 0.4 });
    const b = event({ id: 'b', type: 'cme', severity: 0.4 });
    const c = event({ id: 'c', type: 'solar-flare', severity: 0.3 });
    expect(planSpaceWeather(environment(c, b, a), 'moon', config)?.flags).toEqual([
      SPACE_WEATHER_FLAGS.flare,
    ]);
    expect(planSpaceWeather(environment(a, b, c), 'moon', config)).toEqual(
      planSpaceWeather(environment(c, b, a), 'moon', config),
    );
  });
});

const survival: LabOptions = {
  nodes: [
    labNode(
      's',
      { label: 'Hold', days: 1, goto: '$interludes' },
      { label: 'Push', days: 1, goto: '$interludes' },
    ),
  ],
  endings: { 'lab.done': { outcome: 'advance', title: 'DONE', text: 'Survived.' } },
  clock: { startDay: 1, simulate: true },
  interludes: {
    pools: ['colony', 'moon', 'mars', 'followup', 'injected'],
    every: [2, 3],
    untilDay: 40,
    goalEnding: 'lab.done',
  },
};

function start(world: string, env: EnvironmentSnapshot | undefined, seed = 11): GameSession {
  return GameSessionFactory.create({
    bundle: labBundle(survival),
    worldId: world,
    difficultyId: 'commander',
    seed,
    callsign: 'LAB',
    environment: env,
  });
}

/** Plays 'left' until the chapter ends, returning every card shown and the final state. */
function playThrough(session: GameSession): { cards: string[]; texts: string[] } {
  const cards: string[] = [];
  const texts: string[] = [];
  for (let i = 0; i < 80 && session.status === 'playing'; i += 1) {
    const card = session.view().card;
    if (card) {
      cards.push(card.id);
      texts.push(card.text);
    }
    session.choose('left');
  }
  return { cards, texts };
}

describe('space weather in a session', () => {
  it.each([
    ['moon', 'm_space_weather'],
    ['mars', 'r_space_weather'],
  ])('injects the %s alert card once when NASA activity is significant', (world, cardId) => {
    const { cards, texts } = playThrough(start(world, environment(event({ severity: 0.9 }))));
    expect(cards.filter((id) => id === cardId)).toHaveLength(1);
    const alert = texts[cards.indexOf(cardId)];
    expect(alert).toContain('SPACE WEATHER ALERT');
    expect(alert).toContain('coronal mass ejection');
  });

  it.each(['moon', 'mars'])(
    'plays exactly as before when there is no environment (%s)',
    (world) => {
      const plain = start(world, undefined);
      const quiet = start(world, environment(event({ severity: 0.01 })));
      const plainRun = playThrough(plain);
      const quietRun = playThrough(quiet);
      expect(plainRun.cards.some((id) => id.endsWith('space_weather'))).toBe(false);
      expect(quietRun).toEqual(plainRun);
      expect(quiet.view()).toEqual(plain.view());
    },
  );

  it('keeps the alert from consuming RNG: unrelated cards are drawn identically', () => {
    const plain = playThrough(start('moon', undefined)).cards;
    const alerted = playThrough(start('moon', environment(event({ severity: 0.9 })))).cards;
    const strip = (cards: string[]) => cards.filter((id) => id !== 'm_space_weather');
    expect(strip(alerted).slice(0, 3)).toEqual(strip(plain).slice(0, 3));
  });

  it('replays and resumes deterministically with the same snapshot', () => {
    const env = environment(event({ severity: 0.9 }));
    const original = start('moon', env);
    original.choose('left');
    const saved = JSON.parse(JSON.stringify(original.snapshot()));
    expect(saved.environment).toEqual(env);

    const resumed = GameSessionFactory.restore(labBundle(survival), saved);
    expect(resumed.environment).toEqual(env);
    expect(playThrough(resumed)).toEqual(playThrough(original));

    const replay = GameSessionFactory.replay(
      {
        bundle: labBundle(survival),
        worldId: 'moon',
        difficultyId: 'commander',
        seed: 11,
        callsign: 'LAB',
        environment: env,
      },
      original.commandLog,
    );
    expect(replay.snapshot().state).toEqual(original.snapshot().state);
  });

  it('still loads saves made before the environment existed', () => {
    const legacy = JSON.parse(JSON.stringify(start('mars', undefined).snapshot()));
    expect(legacy).not.toHaveProperty('environment');
    const resumed = GameSessionFactory.restore(labBundle(survival), legacy);
    expect(resumed.environment).toBeUndefined();
    expect(playThrough(resumed).cards.length).toBeGreaterThan(0);
  });
});
