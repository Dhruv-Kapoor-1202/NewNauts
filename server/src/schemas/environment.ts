/**
 * Zod schema of the engine's `EnvironmentSnapshot`. The server cannot re-fetch NASA data for a
 * past run, so a client-supplied snapshot is accepted but strictly bounded: it can only select
 * between cards that already exist in the content and never carries free text.
 */
import { z } from 'zod';
import { MAX_ID_LENGTH, MAX_SPACE_WEATHER_EVENTS } from '../config/constants.js';
import { ContentIdSchema } from './common.js';

const SpaceWeatherEventSchema = z.strictObject({
  id: z.string().min(1).max(MAX_ID_LENGTH),
  source: z.literal('NASA_DONKI'),
  type: z.enum(['solar-flare', 'cme']),
  timestamp: z.iso.datetime(),
  severity: z.number().min(0).max(1),
  eligibleWorlds: z.array(ContentIdSchema).max(MAX_ID_LENGTH),
});

/** Normalised environment stored with a run and replayed for scoring. */
export const EnvironmentSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  spaceWeather: z.array(SpaceWeatherEventSchema).max(MAX_SPACE_WEATHER_EVENTS),
});
