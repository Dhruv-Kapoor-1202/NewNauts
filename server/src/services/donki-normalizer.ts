/**
 * DONKI normaliser: maps raw NASA DONKI payloads into the engine's `SpaceWeatherEvent`. Raw
 * shapes stop here; invalid items are dropped one by one so a single bad record never discards
 * the rest.
 *
 * Severity is 0 (minimal) to 1 (significant) and derived only from measured values:
 * - Solar flare: log-scaled peak X-ray class. C1.0 (1e-6 W/m²) = 0, M1.0 = 0.5, X1.0 (1e-4) = 1.
 *   Weaker flares (A, B) are 0; stronger than X1.0 is clamped to 1.
 * - CME: plane-of-sky speed in km/s, linear from 300 (slow, near ambient solar wind) = 0 to
 *   2000 (very fast) = 1. A CME without a measured speed is skipped rather than guessed.
 */
import type { SpaceWeatherEvent } from '@commander/engine';
import { z } from 'zod';

const ELIGIBLE_WORLDS = ['moon', 'mars'];

const FLARE_CLASS_FLUX: Readonly<Record<string, number>> = {
  A: 1e-8,
  B: 1e-7,
  C: 1e-6,
  M: 1e-5,
  X: 1e-4,
};
const FLARE_FLUX_FLOOR = 1e-6;
const FLARE_FLUX_CEILING = 1e-4;

export const CME_SPEED_FLOOR_KMS = 300;
export const CME_SPEED_CEILING_KMS = 2000;

const FlareSchema = z.object({
  flrID: z.string().min(1),
  beginTime: z.string(),
  classType: z.string(),
});

const CmeSchema = z.object({
  activityID: z.string().min(1),
  startTime: z.string(),
  cmeAnalyses: z
    .array(z.object({ isMostAccurate: z.boolean().nullish(), speed: z.number().nullish() }))
    .nullish(),
});

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Severity of a flare class such as `M2.5`; undefined when the class cannot be read. */
export function severityFromFlareClass(classType: string): number | undefined {
  const match = /^([A-Z])(\d+(?:\.\d+)?)$/.exec(classType.trim().toUpperCase());
  const base = match?.[1] ? FLARE_CLASS_FLUX[match[1]] : undefined;
  if (base === undefined || !match?.[2]) return undefined;
  const flux = base * Number(match[2]);
  const span = Math.log10(FLARE_FLUX_CEILING / FLARE_FLUX_FLOOR);
  return clamp01(Math.log10(flux / FLARE_FLUX_FLOOR) / span);
}

/** Severity of a CME speed in km/s. */
export function severityFromCmeSpeed(speedKms: number): number {
  return clamp01((speedKms - CME_SPEED_FLOOR_KMS) / (CME_SPEED_CEILING_KMS - CME_SPEED_FLOOR_KMS));
}

function toIso(time: string): string | undefined {
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toEvent(
  id: string,
  type: SpaceWeatherEvent['type'],
  time: string,
  severity: number | undefined,
): SpaceWeatherEvent[] {
  const timestamp = toIso(time);
  if (severity === undefined || timestamp === undefined) return [];
  return [{ id, source: 'NASA_DONKI', type, timestamp, severity, eligibleWorlds: ELIGIBLE_WORLDS }];
}

/** Normalises a `DONKI/FLR` response; anything that is not a valid list yields no events. */
export function normalizeFlares(payload: unknown): SpaceWeatherEvent[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item: unknown) => {
    const flare = FlareSchema.safeParse(item);
    if (!flare.success) return [];
    const { flrID, beginTime, classType } = flare.data;
    return toEvent(flrID, 'solar-flare', beginTime, severityFromFlareClass(classType));
  });
}

/** Normalises a `DONKI/CME` response; anything that is not a valid list yields no events. */
export function normalizeCmes(payload: unknown): SpaceWeatherEvent[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item: unknown) => {
    const cme = CmeSchema.safeParse(item);
    if (!cme.success) return [];
    const measured = (cme.data.cmeAnalyses ?? []).filter(
      (analysis) => typeof analysis.speed === 'number',
    );
    const speed = (measured.find((analysis) => analysis.isMostAccurate) ?? measured[0])?.speed;
    const severity = typeof speed === 'number' ? severityFromCmeSpeed(speed) : undefined;
    return toEvent(cme.data.activityID, 'cme', cme.data.startTime, severity);
  });
}
