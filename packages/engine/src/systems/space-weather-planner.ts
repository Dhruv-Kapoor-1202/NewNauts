/**
 * SpaceWeatherPlanner: turns an environment snapshot into at most one scheduled alert card for a
 * world. Pure and RNG-free, so a run with the same snapshot always plays the same way, and a run
 * without one is untouched.
 */
import type { EnvironmentSnapshot, SpaceWeatherEvent } from '../domain/environment.js';
import type { WorldId } from '../domain/ids.js';
import type { GameConfig } from '../content/schemas/index.js';

/** Flags set on the session so the alert card's text variants can react to the activity. */
export const SPACE_WEATHER_FLAGS = {
  flare: 'nasaFlare',
  cme: 'nasaCme',
  strong: 'nasaStrong',
} as const;

/** The alert to inject during a run. */
export interface SpaceWeatherPlan {
  cardId: string;
  day: number;
  flags: string[];
}

/** Most severe eligible event; ties resolve by id so the choice never depends on input order. */
function strongest(
  events: readonly SpaceWeatherEvent[],
  worldId: WorldId,
  minSeverity: number,
): SpaceWeatherEvent | undefined {
  return events
    .filter((event) => event.eligibleWorlds.includes(worldId) && event.severity >= minSeverity)
    .sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id))[0];
}

/** @returns the plan, or undefined when nothing relevant happened or the world has no alert card. */
export function planSpaceWeather(
  environment: EnvironmentSnapshot | undefined,
  worldId: WorldId,
  config: GameConfig['spaceWeather'],
): SpaceWeatherPlan | undefined {
  const cardId = config.cards[worldId];
  if (!environment || !cardId) return undefined;
  const event = strongest(environment.spaceWeather, worldId, config.minSeverity);
  if (!event) return undefined;
  const flags: string[] = [
    event.type === 'cme' ? SPACE_WEATHER_FLAGS.cme : SPACE_WEATHER_FLAGS.flare,
  ];
  if (event.severity >= config.strongSeverity) flags.push(SPACE_WEATHER_FLAGS.strong);
  return { cardId, day: config.triggerDay, flags };
}
