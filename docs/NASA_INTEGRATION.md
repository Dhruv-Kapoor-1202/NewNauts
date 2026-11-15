# NASA Integration

COMMANDER uses optional NASA data to improve mission realism without making gameplay dependent on external services.

## NASA DONKI

Resource: https://ccmc.gsfc.nasa.gov/DONKI/api/

Purpose: Provides real space-weather information such as solar flares and coronal mass ejections.

COMMANDER uses relevant DONKI data to enrich existing Moon/Mars environmental or interlude events. NASA data is normalized before entering the game.

**What is used.** The server reads `DONKI/FLR` (solar flares) and `DONKI/CME` (coronal mass ejections) for the last 7 days, normalizes them into `SpaceWeatherEvent`s and keeps the 3 most severe. If the strongest eligible event reaches `spaceWeather.minSeverity` (`content/config.json`), the survival chapter injects one existing-style alert card (`m_space_weather` on the Moon, `r_space_weather` on Mars) on `spaceWeather.triggerDay`. The card is a normal interlude: its two choices use ordinary resource effects, and its text varies through the existing flag variants (`nasaCme`, `nasaFlare`, `nasaStrong`). NASA data never changes resources, scoring or achievements directly, and the alert consumes no random numbers.

**Severity (0 = minimal, 1 = significant).** Derived only from measured values:

| Event       | Mapping                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Solar flare | Log-scaled X-ray class: C1.0 = 0, M1.0 = 0.5, X1.0 or stronger = 1. Weaker than C1.0 = 0.                                                    |
| CME         | Linear in the measured speed (most accurate analysis): 300 km/s or less = 0, 2000 km/s or more = 1. A CME with no measured speed is skipped. |

## NASA Earthdata GIBS

Resource: https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api

Purpose: Provides NASA Earth and satellite imagery.

COMMANDER uses this imagery as an optional visual enhancement in the mission UI. GIBS imagery does not affect gameplay, resources, scoring, choices, or mission outcomes.

**Where.** A "NASA EARTH OBSERVATION" panel on the mission selection screen shows the latest complete day of the MODIS Terra true-colour layer (WMS `GetMap`, no key needed). The browser loads it lazily. If it fails, the panel disappears and the screen is unchanged. The image URL is built from the clock on demand and is never saved.

## Flow

NASA API → existing infrastructure/service layer → normalized data → session snapshot → existing COMMANDER systems

```text
DONKI -> server EnvironmentService (cached, timeout) -> donki-normalizer
      -> GET /api/environment -> client prefetch -> new run's EnvironmentSnapshot
      -> saved with the run + sent with the leaderboard submission
      -> engine planner (pure) -> injected alert card in the existing interlude flow
```

The core game engine does not communicate directly with NASA services. It receives only the normalized snapshot.

**Determinism.** The snapshot is fixed when a run starts and stored in the save (`SessionSnapshot.environment`), so resuming, retrying a chapter and the server's replay verification all see the same data. Saves without it still load. The server accepts a client-supplied snapshot only after strict validation (bounded size, known fields, severity 0..1); it can do no more than select the alert card that already exists in the content.

## Reliability

Both integrations are optional. If NASA data or imagery is unavailable, COMMANDER falls back to its existing content and continues normally.

- No key, a timeout (5 s), HTTP errors, rate limiting, invalid JSON, malformed or empty responses all result in "no environment". The server answers `{ "environment": null }` and logs a single warning line (never the key).
- The server caches the answer for 1 hour (5 minutes after a failure) and shares one lookup between concurrent requests.
- The client requests the environment in the background when the app opens; a run that starts before it arrives simply plays without it. With the same seed and choices, a run without NASA data plays exactly as it did before this integration.
- Each endpoint fails independently: `FLR` being unavailable does not affect `CME`.
- Requests go through the `api.nasa.gov` gateway with the key; if the gateway cannot serve an endpoint (it returned 404 for `FLR` while the DONKI host served it), the official DONKI host `ccmc.gsfc.nasa.gov/DONKI/WS/get` is tried next. It needs no key, so the key is never sent there.

## Configuration

| Variable       | Where                                                              | Purpose                                                                               |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `NASA_API_KEY` | server environment, or a git-ignored `.env` in the repository root | Free key from https://api.nasa.gov. Without it DONKI is off (no `DEMO_KEY` fallback). |

Copy `.env.example` to `.env` and set your own key. The key is only used by the server, sent in the `X-Api-Key` header, and never logged, saved or sent to the browser. Never commit a real NASA API key.

Tuning lives in `content/config.json` under `spaceWeather`: `minSeverity`, `strongSeverity`, `triggerDay` and the alert card per world.
