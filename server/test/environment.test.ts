import { randomUUID } from 'node:crypto';
import { GameSessionFactory, type EnvironmentSnapshot } from '@commander/engine';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { RecordingLogger } from '../src/logging/logger.js';
import {
  CME_SPEED_CEILING_KMS,
  CME_SPEED_FLOOR_KMS,
  normalizeCmes,
  normalizeFlares,
  severityFromCmeSpeed,
  severityFromFlareClass,
} from '../src/services/donki-normalizer.js';
import { EnvironmentService } from '../src/services/environment-service.js';
import { registerPlayer } from './helpers/api.js';
import { playToEnd } from './helpers/bot.js';
import { createTestApp, loadMiniBundle } from './helpers/test-app.js';

const KEY = 'test-nasa-key';

const flare = (id: string, classType: string, beginTime = '2030-01-01T05:00Z') => ({
  flrID: id,
  beginTime,
  classType,
});
const cme = (id: string, speed: number | null, startTime = '2030-01-01T06:00Z') => ({
  activityID: id,
  startTime,
  cmeAnalyses: [{ isMostAccurate: true, speed }],
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fake fetch that answers per DONKI endpoint. */
function fakeFetch(answers: { FLR?: () => Response; CME?: () => Response }) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const answer = url.includes('/FLR') ? answers.FLR : answers.CME;
    if (!answer) throw new Error('network down');
    return answer();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function service(fetchFn: typeof fetch, config: { apiKey: string | undefined } = { apiKey: KEY }) {
  const logger = new RecordingLogger();
  let now = Date.UTC(2030, 0, 2);
  const instance = new EnvironmentService({
    apiKey: config.apiKey,
    fetchFn,
    logger,
    clock: () => new Date(now),
  });
  return { instance, logger, advance: (ms: number) => (now += ms) };
}

describe('DONKI severity mapping', () => {
  it.each([
    ['A9.9', 0],
    ['B5.0', 0],
    ['C1.0', 0],
    ['M1.0', 0.5],
    ['X1.0', 1],
    ['X9.3', 1],
    [' m1.0 ', 0.5],
  ])('flare class %s -> %f', (classType, expected) => {
    expect(severityFromFlareClass(classType)).toBeCloseTo(expected, 5);
  });

  it.each(['', 'Z1.0', 'M', '5.0', 'M-1'])('flare class "%s" is unreadable', (classType) => {
    expect(severityFromFlareClass(classType)).toBeUndefined();
  });

  it('keeps flare severity within 0..1 and increasing with class', () => {
    const order = ['C1.0', 'C9.0', 'M1.0', 'M9.0', 'X1.0'].map(severityFromFlareClass);
    expect([...order].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(order);
  });

  it.each([
    [0, 0],
    [CME_SPEED_FLOOR_KMS, 0],
    [(CME_SPEED_FLOOR_KMS + CME_SPEED_CEILING_KMS) / 2, 0.5],
    [CME_SPEED_CEILING_KMS, 1],
    [5000, 1],
  ])('CME speed %d km/s -> %f', (speed, expected) => {
    expect(severityFromCmeSpeed(speed)).toBeCloseTo(expected, 5);
  });
});

describe('DONKI normalisation', () => {
  it('maps flares and CMEs into SpaceWeatherEvent', () => {
    expect(normalizeFlares([flare('F1', 'M1.0')])).toEqual([
      {
        id: 'F1',
        source: 'NASA_DONKI',
        type: 'solar-flare',
        timestamp: '2030-01-01T05:00:00.000Z',
        severity: expect.closeTo(0.5, 5),
        eligibleWorlds: ['moon', 'mars'],
      },
    ]);
    const [event] = normalizeCmes([cme('C1', 1150)]);
    expect(event).toMatchObject({ id: 'C1', type: 'cme', severity: expect.closeTo(0.5, 5) });
  });

  it('prefers the most accurate CME analysis and skips CMEs without a measured speed', () => {
    const analysed = {
      activityID: 'C2',
      startTime: '2030-01-01T06:00Z',
      cmeAnalyses: [
        { isMostAccurate: false, speed: 2000 },
        { isMostAccurate: true, speed: 300 },
      ],
    };
    expect(normalizeCmes([analysed])[0]?.severity).toBe(0);
    expect(normalizeCmes([cme('C3', null), { ...cme('C4', 500), cmeAnalyses: null }])).toEqual([]);
  });

  it('treats empty and malformed payloads as "no events"', () => {
    for (const payload of [[], null, undefined, 'oops', { error: 'x' }, 42]) {
      expect(normalizeFlares(payload)).toEqual([]);
      expect(normalizeCmes(payload)).toEqual([]);
    }
  });

  it('drops invalid items individually and keeps the valid ones', () => {
    const events = normalizeFlares([
      flare('ok', 'X1.0'),
      { flrID: 'no-class', beginTime: '2030-01-01T05:00Z' },
      flare('bad-time', 'M1.0', 'not-a-date'),
      flare('bad-class', 'Q9'),
      null,
    ]);
    expect(events.map((e) => e.id)).toEqual(['ok']);
  });
});

describe('EnvironmentService', () => {
  it('is off without a key and never calls NASA', async () => {
    const fetchFn = fakeFetch({ CME: () => json([cme('C1', 1500)]) });
    for (const apiKey of [undefined, '']) {
      const { instance } = service(fetchFn, { apiKey });
      expect(await instance.current()).toBeNull();
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns the most severe events, sends the key as a header and caches the answer', async () => {
    const fetchFn = fakeFetch({
      FLR: () => json([flare('F1', 'X1.0'), flare('F2', 'C1.0')]),
      CME: () => json([cme('C1', 800), cme('C2', 1900)]),
    });
    const { instance, logger } = service(fetchFn);
    const first = await instance.current();
    expect(first?.spaceWeather.map((e) => e.id)).toEqual(['F1', 'C2', 'C1']);
    expect(first?.createdAt).toBe('2030-01-02T00:00:00.000Z');
    expect(await instance.current()).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    for (const [url, init] of fetchFn.mock.calls as [string, RequestInit][]) {
      expect(url).not.toContain(KEY);
      expect((init.headers as Record<string, string>)['X-Api-Key']).toBe(KEY);
    }
    expect(JSON.stringify(logger.messages)).not.toContain(KEY);
  });

  it('shares one lookup between concurrent callers', async () => {
    const fetchFn = fakeFetch({ FLR: () => json([]), CME: () => json([cme('C1', 1500)]) });
    const { instance } = service(fetchFn);
    await Promise.all([instance.current(), instance.current(), instance.current()]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('falls back to the official DONKI host, without the key, when the gateway lacks an endpoint', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      if (url.startsWith('https://api.nasa.gov/'))
        return url.includes('/FLR') ? json({}, 404) : json([]);
      return json([flare('F1', 'X1.0')]);
    }) as unknown as typeof fetch;
    const { instance, logger } = service(fetchFn);
    expect((await instance.current())?.spaceWeather.map((e) => e.id)).toEqual(['F1']);
    expect(logger.messages).toEqual([]);
    const direct = calls.filter((call) => call.url.startsWith('https://ccmc.gsfc.nasa.gov/'));
    expect(direct).toHaveLength(1);
    expect(direct[0]?.headers).toEqual({});
  });

  it('keeps working when one endpoint fails', async () => {
    const fetchFn = fakeFetch({
      FLR: () => json({ status: 404 }, 404),
      CME: () => json([cme('C1', 1500)]),
    });
    const { instance, logger } = service(fetchFn);
    expect((await instance.current())?.spaceWeather.map((e) => e.id)).toEqual(['C1']);
    expect(logger.messages.map((m) => m.message)).toContain('NASA DONKI FLR responded 404');
  });

  it.each([
    ['network failure', {}],
    ['HTTP errors', { FLR: () => json({}, 500), CME: () => json({}, 429) }],
    [
      'invalid JSON',
      {
        FLR: () => new Response('<html>', { status: 200 }),
        CME: () => new Response('{', { status: 200 }),
      },
    ],
    ['empty responses', { FLR: () => json([]), CME: () => json([]) }],
    ['malformed responses', { FLR: () => json({ a: 1 }), CME: () => json([{ x: 1 }]) }],
  ])('resolves to null on %s without throwing', async (_name, answers) => {
    const { instance } = service(fakeFetch(answers));
    await expect(instance.current()).resolves.toBeNull();
  });

  it('retries a failed lookup sooner than a successful one', async () => {
    const fetchFn = fakeFetch({});
    const { instance, advance } = service(fetchFn);
    await instance.current();
    await instance.current();
    expect(fetchFn).toHaveBeenCalledTimes(4);
    advance(5 * 60 * 1000 + 1);
    await instance.current();
    expect(fetchFn).toHaveBeenCalledTimes(8);
  });
});

describe('GET /api/environment', () => {
  it('answers { environment: null } when NASA is not configured', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/environment').expect(200);
    expect(res.body).toEqual({ environment: null });
  });

  it('answers { environment: null } when NASA is down', async () => {
    const { app } = createTestApp({ config: { nasaApiKey: KEY }, fetchFn: fakeFetch({}) });
    const res = await request(app).get('/api/environment').expect(200);
    expect(res.body).toEqual({ environment: null });
  });

  it('returns the normalised snapshot', async () => {
    const fetchFn = fakeFetch({ CME: () => json([cme('C1', 1500)]) });
    const { app } = createTestApp({ config: { nasaApiKey: KEY }, fetchFn });
    const res = await request(app).get('/api/environment').expect(200);
    expect(res.body.environment.spaceWeather).toHaveLength(1);
    expect(res.body.environment.spaceWeather[0]).toMatchObject({ id: 'C1', source: 'NASA_DONKI' });
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });
});

describe('runs that carry an environment', () => {
  const bundle = loadMiniBundle();
  const environment: EnvironmentSnapshot = {
    createdAt: '2030-01-01T00:00:00.000Z',
    spaceWeather: [
      {
        id: 'C1',
        source: 'NASA_DONKI',
        type: 'cme',
        timestamp: '2030-01-01T00:00:00.000Z',
        severity: 0.9,
        eligibleWorlds: ['moon', 'mars'],
      },
    ],
  };

  it('is replayed with the same environment when scoring', async () => {
    const { app } = createTestApp();
    const playerId = await registerPlayer(app, 'ace');
    const session = GameSessionFactory.create({
      bundle,
      worldId: 'moon',
      difficultyId: 'commander',
      seed: 11,
      callsign: 'ACE',
      environment,
    });
    const commands = playToEnd(session, 3);
    const res = await request(app)
      .post('/api/leaderboard')
      .send({
        playerId,
        runId: randomUUID(),
        seed: 11,
        world: 'moon',
        difficulty: 'commander',
        commands,
        environment,
      })
      .expect(201);
    expect(res.body.entry.score).toBe(session.view().report?.score);
  });

  it('is stored with a saved run and returned unchanged on resume', async () => {
    const { app } = createTestApp();
    const playerId = await registerPlayer(app);
    const runId = randomUUID();
    const session = GameSessionFactory.create({
      bundle,
      worldId: 'moon',
      difficultyId: 'commander',
      seed: 4,
      callsign: 'NOVA',
      environment,
    });
    session.choose('left');
    const snapshot = JSON.parse(JSON.stringify(session.snapshot()));
    await request(app).put(`/api/progress/${playerId}/${runId}`).send(snapshot).expect(200);
    const loaded = await request(app).get(`/api/progress/${playerId}/${runId}`).expect(200);
    expect(loaded.body.environment).toEqual(environment);
  });

  it('still saves and loads runs that have no environment', async () => {
    const { app } = createTestApp();
    const playerId = await registerPlayer(app);
    const runId = randomUUID();
    const session = GameSessionFactory.create({
      bundle,
      worldId: 'moon',
      difficultyId: 'commander',
      seed: 4,
      callsign: 'NOVA',
    });
    await request(app)
      .put(`/api/progress/${playerId}/${runId}`)
      .send(JSON.parse(JSON.stringify(session.snapshot())))
      .expect(200);
    const loaded = await request(app).get(`/api/progress/${playerId}/${runId}`).expect(200);
    expect(loaded.body).not.toHaveProperty('environment');
  });

  it.each([
    ['an unknown key', { ...environment, extra: true }],
    [
      'an out-of-range severity',
      { ...environment, spaceWeather: [{ ...environment.spaceWeather[0], severity: 7 }] },
    ],
    [
      'too many events',
      { ...environment, spaceWeather: Array(4).fill(environment.spaceWeather[0]) },
    ],
  ])('rejects %s with 400', async (_name, bad) => {
    const { app } = createTestApp();
    const playerId = await registerPlayer(app);
    await request(app)
      .post('/api/leaderboard')
      .send({
        playerId,
        runId: randomUUID(),
        seed: 1,
        world: 'moon',
        difficulty: 'commander',
        commands: [],
        environment: bad,
      })
      .expect(400);
  });
});
