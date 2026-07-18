# Repository Guidelines

## Project Structure & Module Organization

Infinibike is a static Vite/TypeScript application using Three.js. Application orchestration and DOM UI live in `src/app.ts`; global styling is in `src/style.css`. Keep reusable code within its existing boundary:

- `src/world/`: deterministic road generation, chunk streaming, Three.js rendering, and graphics quality.
- `src/audio/`: synthesized ambient mixing and Web Audio lifecycle.
- `src/trainer/`: FTMS Bluetooth transport, packet/control encoding, demo input, and terrain resistance.
- `src/domain/`: environment settings, calibration, ride physics, randomization, and local history.
- `tests/unit/`: Vitest tests for pure domain, world, and trainer behavior.
- `tests/e2e/`: Playwright desktop and mobile user flows.
- `.github/workflows/`: CI and GitHub Pages deployment.

Place future static assets in `public/assets/`; do not commit generated `dist/`, test reports, or `node_modules/`.

## Build, Test, and Development Commands

- `npm install`: install locked dependencies.
- `npm run dev`: start Vite at `http://localhost:5173`.
- `npm run build`: type-check and produce the static `dist/` build.
- `npm test`: run unit tests once.
- `npm run test:e2e`: run Playwright on desktop and mobile projects.
- `npm run lint`: run ESLint.
- `npm run format`: verify Prettier formatting.
- `npm run check`: run lint, formatting, unit tests, and the production build.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, double quotes, semicolons, and trailing commas; Prettier enforces formatting. Use `PascalCase` for classes and types, `camelCase` for functions and variables, and kebab-case filenames. Avoid `any`. Keep generator and trainer calculations pure and independently testable. Dispose Three.js geometries, materials, textures, and retired chunks explicitly.

## Testing Guidelines

Name unit tests `*.test.ts` and E2E tests `*.spec.ts`. Add deterministic tests for seeds, chunk seams, grade bounds, FTMS flags, control commands, and ride calculations. User-visible changes require Playwright coverage at desktop and mobile viewports; rendering changes should also assert nonblank canvas output and bounded renderer diagnostics. Physical trainer behavior must be documented as manually tested or untested.

## Commit & Pull Request Guidelines

History currently contains only `Initial commit`. Use short imperative subjects such as `Add alpine landmarks`. Pull requests should describe behavior, list checks run, link relevant issues, and include screenshots for visual changes. Call out Bluetooth writes, resistance safety, browser/hardware testing, storage migrations, and GitHub Pages configuration changes.
