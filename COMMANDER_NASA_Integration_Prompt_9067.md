# COMMANDER: Add NASA Data Integration to the Existing Game

The COMMANDER game is already fully built and functional.

Your task is to inspect the existing codebase and add the NASA integrations described below using the **smallest, safest, and most optimized changes possible**.

Do NOT rebuild, redesign, or unnecessarily refactor the application.

Adapt the implementation to the architecture, patterns, naming conventions, services, state management, dependency injection, configuration, UI components, and folder structure that already exist in the repository.

---

# Goal

Integrate two NASA resources:

1. **NASA DONKI**
   - Real space-weather data.
   - Used to enhance Moon/Mars environmental events and interludes.

2. **NASA Earthdata GIBS**
   - Real NASA satellite imagery.
   - Used only as a visual enhancement in a suitable existing UI location.

NASA data should make COMMANDER feel more realistic and scientifically connected to NASA without changing the fundamental gameplay.

---

# NASA Resources

## 1. NASA DONKI

Official API reference:

https://ccmc.gsfc.nasa.gov/DONKI/api/

NASA API portal:

https://api.nasa.gov/

DONKI stands for **Space Weather Database Of Notifications, Knowledge, Information**.

Use DONKI for relevant recent space-weather information.

Prioritize data useful to a Moon/Mars mission, such as:

- Solar flares
- Coronal Mass Ejections (CME)
- Geomagnetic or other relevant space-weather activity

Do NOT integrate every DONKI endpoint. Choose the smallest useful subset after inspecting the existing game.

Example endpoints:

```text
https://api.nasa.gov/DONKI/FLR
https://api.nasa.gov/DONKI/CME
```

Use the configured NASA API key according to the application's existing configuration pattern. Do not hard-code a real API key.

### How DONKI Should Affect COMMANDER

DONKI must not introduce a new gameplay system.

Instead, NASA data should enrich the game's existing:

- environmental events
- interlude cards
- narrative variants
- flags
- choices
- consequences

Preferred flow:

```text
NASA reports relevant solar activity
              ↓
Normalize the NASA event
              ↓
Existing environmental/interlude system
              ↓
Space-weather-themed event or card
              ↓
Existing player choices
              ↓
Existing command and resource consequence flow
```

Example narrative:

```text
SPACE WEATHER ALERT

Mission Control has detected increased solar activity.
Surface operations may expose the crew and equipment to higher radiation levels.
```

The choices and consequences must continue to use existing mechanics. NASA data itself must not directly modify resources or bypass the established command flow.

### Normalize DONKI Data

Do not expose raw NASA API models to the game engine.

Create or adapt a minimal internal model similar to:

```ts
interface SpaceWeatherEvent {
  id: string;
  source: "NASA_DONKI";
  type: string;
  timestamp: string;
  severity: number;
  eligibleWorlds: ("moon" | "mars")[];
}
```

This is only an example. If equivalent models already exist, extend or reuse them.

Normalize severity into a predictable internal range, preferably:

```text
0.0 = minimal
1.0 = significant
```

The mapping must be deterministic and documented. Do not invent scientific severity claims that cannot be derived from the NASA response.

---

## 2. NASA Earthdata GIBS

Official resource:

https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api

GIBS stands for **Global Imagery Browse Services**.

Use GIBS to provide real NASA Earth or satellite imagery.

GIBS is a visual enhancement only.

Find one appropriate location in the existing application, preferably something equivalent to:

- Mission Briefing
- Mission Intelligence
- Launch Day
- Environmental context display

Do not add a new screen solely for this integration if an appropriate existing screen already exists.

Example presentation:

```text
MISSION INTELLIGENCE

[ NASA satellite imagery ]

NASA EARTH OBSERVATION
Latest environmental observation available
```

Follow the application's existing styling rather than creating a visually separate NASA component.

### GIBS Restrictions

GIBS must never influence:

- resources
- scoring
- choices
- RNG
- narrative branching
- achievements
- survival
- mission success or failure
- world simulation

It is presentation data only.

If imagery fails to load, retain the existing UI, image, or background without displaying a technical error to the player.

---

# Architecture

Before changing code, inspect the repository and identify:

- current application architecture
- game engine boundary
- infrastructure or service layer
- existing HTTP client
- dependency injection pattern
- session state
- save and resume implementation
- API and configuration handling
- content and event system
- Moon and Mars world implementations
- environmental and interlude mechanics
- current UI components
- logging and error-handling approach
- testing conventions

Use the smallest appropriate extension point.

Do not impose a new architecture if suitable infrastructure already exists.

Preferred conceptual flow:

```text
NASA API
    ↓
Existing infrastructure or service layer
    ↓
NASA adapter or mapper
    ↓
Minimal normalized model
    ↓
Session environment data
    ↓
Existing game systems
```

The core game engine must not know about:

- NASA URLs
- NASA API keys
- HTTP details
- raw DONKI response structures
- GIBS API details

Keep external concerns outside the pure game logic.

---

# Session-Level Data

Avoid calling NASA repeatedly during gameplay.

Preferred approach:

```text
Mission or session initializes
        ↓
Retrieve required NASA data
        ↓
Normalize it
        ↓
Create a small environment snapshot
        ↓
Reuse it during the session
```

If needed, introduce or extend an existing structure similar to:

```ts
interface EnvironmentSnapshot {
  createdAt: string;
  spaceWeather: SpaceWeatherEvent[];
  imagery?: {
    source: "NASA_GIBS";
    url: string;
  };
}
```

Do not create this exact interface if the existing architecture already has an appropriate place for the information. Reuse or extend existing models whenever reasonable.

---

# Deterministic Gameplay

COMMANDER currently relies on deterministic gameplay and seeded randomness. Do not break this.

Live NASA data must not unexpectedly alter an already-running mission.

Once NASA information has been selected for a session, keep it stable. If required, persist the minimal normalized NASA snapshot through the existing save/session mechanism.

An existing saved mission must not retrieve different NASA data halfway through the mission and produce different gameplay.

Existing saves that do not contain NASA information must continue working. Maintain backward compatibility.

When NASA data is unavailable:

```text
same seed + same choices = same existing game result
```

NASA integration is enrichment, not a dependency.

---

# Failure Handling

Treat NASA services as optional.

Handle:

- network failure
- timeout
- HTTP errors
- rate limiting
- invalid JSON
- malformed responses
- missing fields
- empty responses
- unavailable imagery
- missing configuration
- missing API key

Expected behavior:

```text
NASA available
      ↓
Enhance the existing experience

NASA unavailable
      ↓
Continue the existing COMMANDER experience
```

NASA failures must never:

- crash COMMANDER
- prevent mission startup
- block gameplay
- block player input
- corrupt state
- break save/resume
- cause an unhandled promise rejection
- display raw technical errors to players

Use existing fallback and error-handling conventions.

Do not introduce complex retry infrastructure. Use a reasonable timeout and fail gracefully.

---

# Performance

Keep the integration lightweight.

Requirements:

- avoid repeated NASA requests
- retrieve only data actually needed
- normalize responses once
- reuse session data
- lazy-load GIBS imagery where appropriate
- do not block gameplay while waiting for NASA
- avoid large dependencies
- avoid adding an SDK if existing HTTP infrastructure is sufficient
- avoid storing full NASA responses
- keep persisted NASA data minimal

The integration should have negligible impact on normal gameplay performance.

---

# Security and Configuration

Follow the project's existing configuration pattern.

If DONKI requires an API key, use an environment or configuration value. Adapt to the project's naming convention rather than blindly using this example:

```text
NASA_API_KEY=
```

If the project has an `.env.example`, update it with a placeholder only:

```text
NASA_API_KEY=your_nasa_api_key
```

Never:

- commit a real key
- hard-code credentials
- log the API key
- expose server-side secrets to the frontend
- store secrets in save files
- include secrets in NASA integration documentation

If no NASA API key or configuration is available, COMMANDER must continue working normally.

---

# Coding Standards

Follow the repository's established coding conventions first.

Maintain normal production-quality coding practices:

- strict TypeScript
- strong and narrow typing
- descriptive naming
- small focused functions
- single responsibility
- separation of concerns
- dependency injection where already used
- dependency inversion at external-service boundaries
- immutable data where practical
- early returns
- validation of external input
- graceful error handling
- consistent async/await usage
- existing logging conventions
- existing formatting rules
- existing ESLint rules
- existing Prettier rules

Avoid:

- `any`
- magic numbers
- duplicated logic
- unnecessary abstractions
- unnecessary interfaces
- unnecessary new packages
- unnecessary wrappers
- unnecessary new folders
- dead code
- commented-out code
- excessive logging
- speculative refactoring
- unrelated cleanup

Comments should explain why something exists when the reason is not obvious. Do not add comments that simply repeat the code.

---

# Tests

Do not call live NASA APIs from automated tests.

Use the project's existing mocks, fakes, fixtures, HTTP-mocking approach, or dependency injection.

Add only focused tests required for this change.

## DONKI Tests

Cover:

```text
Valid response → correctly normalized
Empty response → existing gameplay continues
Invalid or malformed response → safely ignored or falls back
Timeout or API error → existing gameplay continues
```

Test severity normalization boundaries if severity mapping is introduced.

## GIBS Tests

Cover:

```text
Valid imagery → imagery can be presented
Imagery failure → existing visual or UI remains
```

Ensure GIBS data cannot affect gameplay state.

---

# Regression Protection

Explicitly verify:

- existing tests still pass
- the existing game starts normally
- the game remains playable without NASA
- existing cards continue working
- existing choices continue working
- resources behave normally
- achievements still work
- scoring still works
- Moon gameplay still works
- Mars gameplay still works
- seeded RNG behavior is preserved
- save/resume works
- retry/checkpoint behavior works
- older save data still loads
- NASA API failure does not affect mission initialization

Do not modify unrelated tests simply to make the build pass.

---

# Documentation to Create

Create a short file named:

```text
NASA_INTEGRATION.md
```

Place it in the repository's existing documentation location.

Use the following content, adjusting configuration names and implementation details to match what was actually implemented:

```markdown
# NASA Integration

COMMANDER uses optional NASA data to improve mission realism without making gameplay dependent on external services.

## NASA DONKI

Resource: https://ccmc.gsfc.nasa.gov/DONKI/api/

Purpose: Provides real space-weather information such as solar flares and coronal mass ejections.

COMMANDER uses relevant DONKI data to enrich existing Moon/Mars environmental or interlude events. NASA data is normalized before entering the game.

## NASA Earthdata GIBS

Resource: https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api

Purpose: Provides NASA Earth and satellite imagery.

COMMANDER uses this imagery as an optional visual enhancement in the mission UI. GIBS imagery does not affect gameplay, resources, scoring, choices, or mission outcomes.

## Flow

NASA API → existing infrastructure/service layer → normalized data → session snapshot → existing COMMANDER systems

The core game engine does not communicate directly with NASA services.

## Reliability

Both integrations are optional. If NASA data or imagery is unavailable, COMMANDER falls back to its existing content and continues normally.

## Configuration

Document only configuration variables that were actually added. Never commit a real NASA API key.
```

---

# Minimal Implementation Strategy

Do not begin by creating a large collection of new files.

First inspect how COMMANDER already handles equivalent functionality.

Prefer:

```text
Extend an existing service instead of creating a new service layer.
Extend existing session state instead of creating separate NASA persistence.
Extend existing events instead of creating a NASA-specific gameplay engine.
Extend an existing UI component instead of creating a new NASA screen.
Reuse the existing HTTP client instead of adding a dependency.
Reuse existing error handling instead of creating a resilience framework.
```

Only create new components where no clean existing extension point exists.

---

# Validation

When implementation is complete, run the project's existing:

1. tests
2. lint
3. TypeScript type checking
4. build

Fix regressions introduced by this change.

Do not make unrelated fixes or refactors unless strictly required for the feature.

---

# Final Output

After implementation, provide a short summary:

## Added

New files or components.

## Modified

Existing files changed and why.

## DONKI

Which endpoint or endpoints were used and how the data enriches existing game content.

## GIBS

Where NASA imagery appears.

## Architecture

Where the NASA integration sits within the existing architecture.

## Fallback

What happens when NASA is unavailable.

## Configuration

Any environment or configuration values introduced.

## Validation

Actual results of:

- tests
- lint
- type-check
- build

Do not claim anything passed unless the command was actually executed successfully.

Most importantly: **preserve the existing COMMANDER experience. The NASA integration should feel like a small enrichment of the finished game, not a rewrite or a new subsystem.**
