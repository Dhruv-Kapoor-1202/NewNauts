/**
 * Builds the NASA GIBS (Global Imagery Browse Services) image URL for the mission screens. GIBS is
 * presentation only: nothing here feeds the engine, the saves or the leaderboard, and the URL is
 * built on demand from the clock, so it is never persisted.
 */

const GIBS_WMS_URL = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const EARTH_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor';
const IMAGE_WIDTH = 640;
const IMAGE_HEIGHT = 320;
/** Yesterday's pass is complete; today's is still being assembled. */
const IMAGE_AGE_DAYS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** URL of a whole-Earth true-colour image from the latest complete day. */
export function earthImageUrl(now: Date = new Date()): string {
  const day = new Date(now.getTime() - IMAGE_AGE_DAYS * MS_PER_DAY).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: EARTH_LAYER,
    CRS: 'EPSG:4326',
    // WMS 1.3.0 with EPSG:4326 orders the box latitude first.
    BBOX: '-90,-180,90,180',
    WIDTH: String(IMAGE_WIDTH),
    HEIGHT: String(IMAGE_HEIGHT),
    FORMAT: 'image/jpeg',
    TIME: day,
  });
  return `${GIBS_WMS_URL}?${params.toString()}`;
}
