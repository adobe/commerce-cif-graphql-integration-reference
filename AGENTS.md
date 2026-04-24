# Commerce CIF GraphQL Integration Reference

Reference implementation for integrating 3rd-party commerce platforms with AEM CIF via the Magento GraphQL API, deployed on Adobe I/O Runtime (App Builder).

## Build

- **Runtime:** Node.js 12.x (CI-tested version), compatible with 10/12/14
- **Adobe I/O CLI:** Required for build/deploy (`aio` v8.x)
- `npm install` — install dependencies
- `aio app build` — build the application
- `aio app deploy` — deploy to Adobe I/O Runtime

## Testing

- **Unit tests (Mocha + Chai + Sinon):** `npm run unit` — runs all `test/**/*Test.js` files
- **Lint + unit + coverage:** `npm test` — runs ESLint, then Mocha with nyc coverage (80% line minimum)
- **Coverage only:** `npm run test-cov`
- No running server required for tests; mocking via `mock-require`

## Code Style

- **ESLint** with `eslint:recommended`: `npm run lint`
- Auto-fix: `npx eslint --fix .`
- **License header required** on all JS files — Apache 2.0 block header enforced by `eslint-plugin-header`; use `--fix` to auto-insert
- `"use strict"` required (global strict mode)
- `no-var` enforced (use `const`/`let`), `one-var: never` (one declaration per statement)
- Ignored: `**/coverage/**`, `dist`, `web-src/src/exc-runtime.js`

## Module Map

| Module | Path | Description |
|--------|------|-------------|
| Common | `actions/common/` | Data loaders, data classes, and schema builder shared by all resolvers |
| Local dispatcher | `actions/local/dispatcher.js` | Main entry point — processes GraphQL requests, hosts local resolvers |
| Remote cart resolver | `actions/remote/cartResolver.js` | Remote resolver for cart operations, integrated via schema delegation |
| Documentation | `actions/documentation/` | Schema pruning tool and introspection endpoint for CIF-subset schema |
| Schema tools | `schemas/` | CLI tools to generate pruned schemas (`generate.js`) and check compatibility (`check.js`) |
| Web frontend | `web-src/` | GraphiQL web app for testing the GraphQL endpoint |
| Tests | `test/` | Unit tests mirroring source structure |

## Architecture

- **GraphQL (graphql-js 14 + graphql-tools 3):** Schema-first approach with schema stitching
- **Resolver pattern:** "Local" resolvers run in the dispatcher action (shared process, shared cache); "remote" resolvers are separate I/O Runtime actions integrated via schema delegation
- **Data layer:** `*Loader.js` classes fetch data (using `dataloader` for batching); companion data classes convert responses to Magento GraphQL types
- **Schema building:** `SchemaBuilder.js` builds the executable schema by merging the local schema with remote schemas discovered via introspection
- **Caching:** Schema cached in global variable (warm containers); optional second-level cache via `@adobe/aio-lib-state` (controlled by `use-aio-cache` in `app.config.yaml`)
- **App config:** `app.config.yaml` defines all Runtime actions, their inputs, and remote schema wiring (`remoteSchemas` map with merge-priority `order`)
- **Runtime:** Actions execute on `nodejs:14` containers in Adobe I/O Runtime
