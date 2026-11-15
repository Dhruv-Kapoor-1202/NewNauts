/**
 * NASA enrichment on the client: the environment provider never blocks or breaks a run, the
 * environment travels with the run (saves and leaderboard submission), and the GIBS Earth image
 * is purely decorative: if it fails the selection screen is unchanged.
 */
import type { EnvironmentSnapshot } from '@commander/engine';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiEnvironmentProvider } from '../src/api/environment-provider';
import { FetchApiClient } from '../src/api/fetch-api-client';
import type { PlayerRegistry } from '../src/api/player-registry';
import type { ApiClient } from '../src/api/types';
import { earthImageUrl } from '../src/game/earth-imagery';
import { RemoteLeaderboardStore, type FinishedRun } from '../src/game/leaderboard-store';
import { createTestServices, renderApp, startGame } from './support';

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

describe('ApiEnvironmentProvider', () => {
  it('has nothing until the answer arrives, then keeps it, and asks only once', async () => {
    let resolve: (value: EnvironmentSnapshot | null) => void = () => undefined;
    const getEnvironment = vi.fn(
      () => new Promise<EnvironmentSnapshot | null>((r) => (resolve = r)),
    );
    const provider = new ApiEnvironmentProvider({ getEnvironment });
    provider.prefetch();
    provider.prefetch();
    expect(provider.current()).toBeUndefined();
    resolve(environment);
    await waitFor(() => expect(provider.current()).toEqual(environment));
    expect(getEnvironment).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the server has none', () => Promise.resolve(null)],
    ['the request fails', () => Promise.reject(new Error('offline'))],
  ])('stays empty and raises nothing when %s', async (_name, getEnvironment) => {
    const provider = new ApiEnvironmentProvider({ getEnvironment });
    provider.prefetch();
    await Promise.resolve();
    await Promise.resolve();
    expect(provider.current()).toBeUndefined();
  });

  it('reads { environment } from GET /api/environment', async () => {
    const fetchFn = vi.fn((_url: string) =>
      Promise.resolve(new Response(JSON.stringify({ environment }), { status: 200 })),
    );
    const api = new FetchApiClient('/api', fetchFn as never);
    await expect(api.getEnvironment()).resolves.toEqual(environment);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/environment');
  });
});

describe('environment in a run', () => {
  it('is stored in the save when available', async () => {
    const services = createTestServices({
      environment: { prefetch: () => undefined, current: () => environment },
    });
    const { user } = renderApp(services);
    await startGame(user);
    await user.keyboard('d');
    await waitFor(() => expect(services.progress.saves).toBeGreaterThan(0));
    const [saved] = [...services.progress.runs.values()];
    expect(saved?.snapshot.environment).toEqual(environment);
  });

  it('starts and saves a normal run when there is no environment', async () => {
    const services = createTestServices();
    const { user } = renderApp(services);
    await startGame(user);
    await user.keyboard('d');
    await waitFor(() => expect(services.progress.saves).toBeGreaterThan(0));
    const [saved] = [...services.progress.runs.values()];
    expect(saved?.snapshot).not.toHaveProperty('environment');
  });

  it('prefetches the environment once when the app opens', async () => {
    const prefetch = vi.fn();
    renderApp(createTestServices({ environment: { prefetch, current: () => undefined } }));
    await screen.findByLabelText('Commander callsign');
    expect(prefetch).toHaveBeenCalledTimes(1);
  });
});

describe('leaderboard submission', () => {
  const finished = (extra: Partial<FinishedRun>): FinishedRun => ({
    runId: 'r',
    seed: 5,
    worldId: 'moon',
    difficultyId: 'cadet',
    callsign: 'ADA',
    commands: [],
    report: { score: 1, day: 1 } as FinishedRun['report'],
    ...extra,
  });

  async function submittedBody(run: FinishedRun): Promise<Record<string, unknown>> {
    const submitScore = vi.fn((body: Record<string, unknown>) =>
      Promise.resolve({ entry: { id: 'e', score: 1, day: 1 }, rank: 1, body }),
    );
    const api = { submitScore, leaderboard: () => Promise.resolve([]) } as unknown as ApiClient;
    const players = { ensure: () => Promise.resolve('p') } as unknown as PlayerRegistry;
    await new RemoteLeaderboardStore(api, players).submit(run);
    return submitScore.mock.calls[0]?.[0] as Record<string, unknown>;
  }

  it('sends the run environment so the server replays the same mission', async () => {
    expect(await submittedBody(finished({ environment }))).toMatchObject({ environment });
  });

  it('sends nothing extra for runs without an environment', async () => {
    expect(await submittedBody(finished({}))).not.toHaveProperty('environment');
  });
});

describe('GIBS Earth imagery', () => {
  it('asks GIBS for the latest complete day only', () => {
    const url = new URL(earthImageUrl(new Date('2030-03-10T08:00:00Z')));
    expect(url.origin).toBe('https://gibs.earthdata.nasa.gov');
    expect(url.searchParams.get('TIME')).toBe('2030-03-09');
    expect(url.searchParams.get('LAYERS')).toBe('MODIS_Terra_CorrectedReflectance_TrueColor');
  });

  async function openSelectScreen() {
    const rendered = renderApp();
    await rendered.user.type(await screen.findByLabelText('Commander callsign'), 'ada{Enter}');
    return within(await screen.findByTestId('select-screen'));
  }

  it('shows the image on the mission selection screen', async () => {
    const select = await openSelectScreen();
    expect(select.getByText('NASA EARTH OBSERVATION')).toBeInTheDocument();
    expect(select.getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('gibs.earthdata'),
    );
  });

  it('disappears silently when the image fails, leaving the screen usable', async () => {
    const select = await openSelectScreen();
    fireEvent.error(select.getByRole('img'));
    expect(select.queryByTestId('earth-observation')).toBeNull();
    expect(select.queryByText(/error|failed/i)).toBeNull();
    expect(select.getByRole('button', { name: /launch/i })).toBeEnabled();
    expect(select.getAllByRole('radio').length).toBeGreaterThan(1);
  });
});
