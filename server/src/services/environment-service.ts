/**
 * EnvironmentService: builds the optional real-world context of a run (NASA DONKI space weather).
 * It is enrichment, never a dependency: a missing key, a timeout, an HTTP error or malformed data
 * all end in `null`, and the answer (success or failure) is cached so NASA is not called per run.
 * The API key stays on the server and is sent as a header, so it never appears in URLs or logs.
 */
import type { EnvironmentSnapshot, SpaceWeatherEvent } from '@commander/engine';
import {
  DONKI_BASE_URL,
  DONKI_DIRECT_URL,
  DONKI_LOOKBACK_DAYS,
  DONKI_TIMEOUT_MS,
  ENVIRONMENT_CACHE_TTL_MS,
  ENVIRONMENT_FAILURE_TTL_MS,
  MAX_SPACE_WEATHER_EVENTS,
} from '../config/constants.js';
import type { Logger } from '../logging/logger.js';
import { normalizeCmes, normalizeFlares } from './donki-normalizer.js';
import type { Clock } from './shared.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Collaborators and settings of the service. */
export interface EnvironmentServiceOptions {
  /** Absent or blank means "no NASA integration". */
  apiKey: string | undefined;
  fetchFn: typeof fetch;
  logger: Logger;
  clock: Clock;
}

interface CachedEnvironment {
  value: EnvironmentSnapshot | null;
  expiresAt: number;
}

const ENDPOINTS = [
  { name: 'FLR', normalize: normalizeFlares },
  { name: 'CME', normalize: normalizeCmes },
] as const;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Provides the current environment snapshot. */
export class EnvironmentService {
  private cached: CachedEnvironment | undefined;
  private pending: Promise<EnvironmentSnapshot | null> | undefined;

  constructor(private readonly options: EnvironmentServiceOptions) {}

  /** @returns recent significant space weather, or null when there is none or NASA is unavailable. */
  async current(): Promise<EnvironmentSnapshot | null> {
    if (!this.options.apiKey) return null;
    const now = this.options.clock().getTime();
    if (this.cached && this.cached.expiresAt > now) return this.cached.value;
    this.pending ??= this.refresh().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async refresh(): Promise<EnvironmentSnapshot | null> {
    const now = this.options.clock();
    const results = await Promise.all(ENDPOINTS.map((endpoint) => this.load(endpoint, now)));
    const answered = results.some((events) => events !== undefined);
    const events = results
      .flatMap((list) => list ?? [])
      .sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id))
      .slice(0, MAX_SPACE_WEATHER_EVENTS);
    const value = events.length > 0 ? { createdAt: now.toISOString(), spaceWeather: events } : null;
    const ttl = answered ? ENVIRONMENT_CACHE_TTL_MS : ENVIRONMENT_FAILURE_TTL_MS;
    this.cached = { value, expiresAt: now.getTime() + ttl };
    return value;
  }

  /** @returns the normalised events, or undefined when the endpoint failed. */
  private async load(
    endpoint: (typeof ENDPOINTS)[number],
    now: Date,
  ): Promise<SpaceWeatherEvent[] | undefined> {
    const start = isoDate(new Date(now.getTime() - DONKI_LOOKBACK_DAYS * MS_PER_DAY));
    const query = `startDate=${start}&endDate=${isoDate(now)}`;
    // The api.nasa.gov gateway sometimes lacks an endpoint (FLR was 404 there while the DONKI
    // host itself served it), so the official DONKI host is the fallback. It needs no key.
    const sources: { url: string; headers: Record<string, string> }[] = [
      { url: `${DONKI_BASE_URL}/${endpoint.name}?${query}`, headers: { 'X-Api-Key': this.key } },
      { url: `${DONKI_DIRECT_URL}/${endpoint.name}?${query}`, headers: {} },
    ];
    let failure = 'is unavailable';
    for (const source of sources) {
      try {
        const response = await this.options.fetchFn(source.url, {
          headers: source.headers,
          signal: AbortSignal.timeout(DONKI_TIMEOUT_MS),
        });
        if (response.ok) return endpoint.normalize(await response.json());
        failure = `responded ${response.status}`;
      } catch {
        failure = 'is unavailable';
      }
    }
    this.options.logger.warn(`NASA DONKI ${endpoint.name} ${failure}`);
    return undefined;
  }

  private get key(): string {
    return this.options.apiKey ?? '';
  }
}
