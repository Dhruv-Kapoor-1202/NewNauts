/**
 * Normalised real-world context for a run (currently NASA DONKI space weather). The engine never
 * sees provider URLs, keys or raw responses: the server maps them into these small models, and
 * the snapshot is stored with the run so replays and resumed saves stay deterministic.
 */
import type { WorldId } from './ids.js';

/** Kinds of space-weather activity the game understands. */
export type SpaceWeatherType = 'solar-flare' | 'cme';

/** One normalised space-weather event. */
export interface SpaceWeatherEvent {
  id: string;
  source: 'NASA_DONKI';
  type: SpaceWeatherType;
  /** ISO 8601 time the activity began. */
  timestamp: string;
  /** 0 = minimal, 1 = significant. */
  severity: number;
  eligibleWorlds: WorldId[];
}

/** What was known about the environment when the run started. */
export interface EnvironmentSnapshot {
  /** ISO 8601 time the snapshot was taken. */
  createdAt: string;
  spaceWeather: SpaceWeatherEvent[];
}
