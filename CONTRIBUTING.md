# Contributing to Freebin

Freebin's web application and VS Code extension share this repository. Start with an issue for a larger behavior change; include a reproducible example for bugs. Keep pull requests focused so reviewers can assess the implementation and its checks together.

## Set up your checkout

Fork the repository on GitHub, clone your fork, and create a branch for your change. Use Node.js 24 or newer and npm.

From the checkout root:

```bash
npm run install:app
cd src/site
npm run db:migrate:local
npm run demo:create
npm run dev -- --port 8788
```

The [application guide](src/site/README.md) explains the Worker, frontend, local storage, deployment configuration, and admin reports. The [extension guide](src/extension/README.md#development) covers its development host and tests.

## Choose the right layer

| Change                                                | Start here                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| Pages, navigation, or inspector interactions          | `src/site/app` and `src/site/components`                     |
| API behavior, authorization, forwarding, or retention | `src/site/server`                                            |
| Worker dispatch or OAuth/MCP integration              | `src/site/worker.js` and `src/site/server`                   |
| Database schema                                       | `src/site/migrations`                                        |
| API or configuration contract                         | `src/site/public/openapi.yaml` and `src/site/public/schemas` |
| CLI or integration example                            | `src/site/public/freebin.mjs` and `src/site/examples`        |
| Editor commands or webview                            | `src/extension/src`                                          |

Keep authorization on the server for each operation. UI visibility alone does not establish permission. Preserve private response caching rules, redact public captures, and avoid exposing credentials through page data, error messages, or static assets.

Capture bodies are read once. Replay and forwarding produce separate attempts and preserve the original capture. Changes to outbound behavior should retain destination validation and sensitive-header stripping.

Add a new numbered SQL migration for schema changes. Preserve existing migration history and test changes with local D1. Update OpenAPI, configuration schemas, examples, and documentation when an API contract changes.

## Before opening a pull request

From `src/site`, run the checks relevant to your change:

```bash
npm run types
npm run check
npm test
npm run build:native
npm run build
```

Frontend, routing, session, capture, sharing, and OAuth changes should also exercise the compiled Worker:

```bash
npm run db:migrate:local
npm run demo:create
npx playwright install chromium
npm run test:e2e
```

For admin/report changes, run `npm run test:admin`. For deployment changes, run `npm run deploy:dry-run`; it checks packaging without uploading code. Browser tests create synthetic data, so use local or disposable test resources.

For extension changes, run this from the repository root:

```bash
npm run extension:install
npm run extension:test
```

For documentation changes, check relative links, command names, working directories, and examples against the current source. Use synthetic values in screenshots and examples. Keep `.env` files, API keys, private request payloads, and local build/test output out of commits.

Review the diff for unrelated edits and whitespace errors with `git diff --check`. [Pull request CI](.github/workflows/pr-ci.yml) checks diff hygiene, Worker types, TypeScript, unit tests, both application builds, browser journeys, deployment packaging, and extension tests.

## Describe your change

A pull request should state the concrete problem, the resulting behavior, and the checks you ran. Include screenshots for visible UI changes and example requests/responses for contract changes. Call out database migrations or operator configuration changes that are needed to use the feature.

For performance work, use comparable before/after workloads. The application's `npm run baseline` records local navigation, search, DOM, payload, and asset measurements; see [performance profiling](src/site/README.md#performance-profiling). Keep synthetic measurements distinct from production Core Web Vitals and include the conditions used to obtain them.

## Report issues

File bugs in [GitHub Issues](https://github.com/corridora/freebin.org/issues) with the affected component, reproduction steps, expected behavior, observed behavior, and relevant runtime/browser versions. Reduce webhook samples and remove credentials or personal data before sharing them.

For dependency updates, retain the lockfile, review `npm audit`, and run the checks for the affected application or extension.
