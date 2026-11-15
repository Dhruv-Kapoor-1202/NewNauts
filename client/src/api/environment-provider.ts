/**
 * EnvironmentProvider: the optional real-world context (NASA space weather) for new runs. It is
 * requested once in the background when the app opens; a run that starts before the answer
 * arrives, or when the server has none, simply plays without it. Nothing here can fail a run.
 */
import type { EnvironmentSnapshot } from '@commander/engine';
import type { ApiClient } from './types';

/** Source of the environment a new run should carry. */
export interface EnvironmentProvider {
  /** Starts the one background lookup (later calls do nothing). */
  prefetch(): void;
  /** The environment if it has arrived, otherwise undefined. Never waits. */
  current(): EnvironmentSnapshot | undefined;
}

/** Fetches the environment from the COMMANDER server. */
export class ApiEnvironmentProvider implements EnvironmentProvider {
  private requested = false;
  private snapshot: EnvironmentSnapshot | undefined;

  constructor(private readonly api: Pick<ApiClient, 'getEnvironment'>) {}

  prefetch(): void {
    if (this.requested) return;
    this.requested = true;
    this.api
      .getEnvironment()
      .then((environment) => {
        this.snapshot = environment ?? undefined;
      })
      .catch(() => undefined);
  }

  current(): EnvironmentSnapshot | undefined {
    return this.snapshot;
  }
}
