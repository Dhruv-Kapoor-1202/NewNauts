/**
 * EarthObservation: a themed panel with a real NASA satellite image of Earth (NASA GIBS). It is
 * purely decorative: while the image loads the panel shows its frame, and if the image cannot be
 * loaded the panel disappears, leaving the screen exactly as it was.
 */
import { useMemo, useState, type ReactElement } from 'react';
import { COPY } from '../app/copy';
import { earthImageUrl } from '../game/earth-imagery';
import { Label, Panel } from './primitives';

/** Real Earth imagery panel for the mission-selection screen. */
export function EarthObservation(): ReactElement | null {
  const url = useMemo(() => earthImageUrl(), []);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Panel as="section" aria-label={COPY.earth.title} data-testid="earth-observation">
      <Label className="block px-3 pt-3">{COPY.earth.title}</Label>
      <img
        src={url}
        alt={COPY.earth.alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="mt-2 aspect-[2/1] w-full object-cover"
      />
      <p className="px-3 pb-3 pt-2 text-xs opacity-70">{COPY.earth.caption}</p>
    </Panel>
  );
}
