# COMMANDER

**COMMANDER** is a Reigns-style swipe game about running humanity's first off-world outpost. You play a **campaign of chapters** (launch, transit, landing, survival, epilogue) on the **Moon** or **Mars**. Every card has two choices; each choice sends the story down a different branch, changes seven colony resources (Power, Food, Water, Shielding, Morale, Comms, Health) and costs time. Choices made in Chapter 0 come back to help or hurt you hours (and chapters) later.

It started as a single-file prototype (`reference/Commander_Mission_Trainer_v2.html`) and is now a TypeScript monorepo with a pure game engine, an Express API, a React client with three swappable themes, and a JSON-only story pipeline. All facts in the cards are NASA-grounded and kid-friendly.

## Prerequisites

- Node.js 20 or newer and npm 10 or newer.

## Quick start

```bash
npm install        # installs all workspaces and builds the engine
npm run dev        # engine watcher + API (http://localhost:3001) + client (http://localhost:5173)
```

Open <http://localhost:5173>. Add `?fast` to skip every animation delay, and `?theme=minimal` (or `holo-hud`, `neo-brutalist`) to pick a theme.

## Scripts

| Script                     | What it does                                                                    |
| -------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`              | Starts the engine watcher, the server and the client together.                  |
| `npm test`                 | Runs every workspace's tests (engine with coverage thresholds, server, client). |
| `npm run lint`             | ESLint over the whole repo (typescript-eslint, react-hooks).                    |
| `npm run build`            | Builds engine, server and client.                                               |
| `npm run format`           | Prettier.                                                                       |
| `npm run content:validate` | Schema-checks all story JSON and validates the story graph.                     |
| `npm run content:graph`    | Writes a Mermaid flowchart per chapter to `docs/graphs/`.                       |
| `npm run content:schema`   | Regenerates the JSON Schemas in `content/schema/` (editor autocomplete).        |

Server environment variables (all optional): `PORT` (3001), `CORS_ORIGIN` (`http://localhost:5173`), `STORAGE_DRIVER` (`json` or `memory`), `DATA_DIR`, `CONTENT_DIR`. Run the production server with `npm run build && npm start -w @commander/server`.

## Folder map

```
content/            all story data (JSON, no code): campaign, chapters, nodes, interludes, worlds, characters ...
docs/               ARCHITECTURE.md, STORY_AUTHORING.md, THEMING.md, graphs/ (generated)
packages/engine/    pure game engine (no React/DOM/Express), Zod schemas, validator, tests
server/             Express API, repositories (json-file / in-memory), replay-verified leaderboard
client/             React + Vite + Tailwind v4 UI, themes, offline fallback
scripts/            content:validate, content:graph, content:schema
reference/          the untouched original prototype
```

## Themes

Open the gear menu in the game, or use `?theme=<id>`. The choice is saved in `localStorage`. Themes shipped: `neo-brutalist` (a faithful port of the prototype), `minimal` (clean, light/dark aware) and `holo-hud` (sci-fi HUD). To add or change a theme see [docs/THEMING.md](docs/THEMING.md).

## Adding story content

You never touch code: add or edit JSON under `content/campaign/`, run `npm run content:validate`, then `npm run content:graph` and review the diagram. The full guide with templates is [docs/STORY_AUTHORING.md](docs/STORY_AUTHORING.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md): layers, patterns, engine event flow, persistence swap guide, save and replay model.
- [Story authoring](docs/STORY_AUTHORING.md): chapters, nodes, endings, flags, validator errors.
- [Theming](docs/THEMING.md): tokens, recipe object, adding a theme.
- [Story graphs](docs/graphs/README.md): generated chapter diagrams.

## Tech decisions

| Decision                             | Reason                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Pure, seeded engine                  | Deterministic replays let the **server verify scores** without trusting the client, and make tests exact.      |
| Content as JSON validated by Zod     | Teammates author stories without code; strict schemas plus a graph validator catch typos, dead ends and loops. |
| npm workspaces                       | One install, shared types through the engine package.                                                          |
| Tailwind v4 with CSS-variable tokens | Themes swap by class; components never hardcode colours or fonts.                                              |
| Fonts bundled with `@fontsource`     | Works offline, no CDN.                                                                                         |
| Client bundles content at build time | The game stays playable when the API is down; progress falls back to `localStorage`.                           |
| Repository pattern on the server     | Storage is one interface away from Cosmos or SQL.                                                              |

Inspired by Reigns and Lapse: A Forgotten Future.
