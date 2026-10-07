# Freebin

[Freebin](https://freebin.org/) captures HTTP requests so you can inspect webhooks, debug integrations, and replay traffic. Run it locally or deploy your own instance to Cloudflare Workers.

The web application uses Next.js App Router, React, and SWR. Cloudflare builds run through vinext, with D1 for application data and KV for OAuth state. A companion VS Code extension brings bin management and request inspection into your editor.

## What you can do

- Create private request bins and capture traffic with account API keys.
- Inspect requests live, search payloads, export data, and view gzip bodies.
- Replay requests, configure automatic forwarding, and define conditional responses.
- Invite collaborators with individual feature permissions or publish revocable read-only links.
- Integrate through the REST API, Node.js CLI, JavaScript/Python examples, or OAuth-capable MCP clients.
- View service totals and an application knowledge graph as an administrator.

## Run locally

Use Node.js 24 or newer and npm.

```bash
git clone https://github.com/corridora/freebin.git
cd freebin.org
npm run install:app
cd src/site
npm run db:migrate:local
npm run demo:create
npm run dev -- --port 8788
```

Open [http://localhost:8788](http://localhost:8788). Local development uses persistent D1 and KV simulations and enables registration. No Cloudflare account or deployment credentials are needed.

To preview the compiled Worker, stop the development server and run these commands from `src/site`:

```bash
npm run build
npm run start -- --port 8788
```

For a Docker-based local environment, run `npm start` from the repository root and open [http://localhost:8787](http://localhost:8787). Docker Compose preserves data in the `freebin-data` volume; `npm run local:down` stops the service.

## Documentation

| Guide                                                                  | Use it for                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Quickstart](quickstart.md)                                            | Capture a request, use the CLI, replay traffic, and connect MCP clients.                   |
| [Application guide](src/site/README.md)                                | Understand the architecture, run checks, configure admin access, and deploy to Cloudflare. |
| [VS Code extension](src/extension/README.md)                           | Connect bins, configure credentials, and develop the extension.                            |
| [Contributing](CONTRIBUTING.md)                                        | Set up a development workflow and prepare a pull request.                                  |
| [OpenAPI contract](src/site/public/openapi.yaml)                       | Build REST API integrations.                                                               |
| [Bin configuration schema](src/site/public/schemas/bin-config.v1.json) | Validate configuration imports and exports.                                                |

The application also serves API documentation at `/docs`, the contract at `/openapi.yaml`, and the CLI at `/freebin.mjs` on each instance.

## Repository commands

Run these from the repository root:

| Command                     | Purpose                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run install:app`       | Install locked web application dependencies.                                              |
| `npm run dev`               | Start the web development server.                                                         |
| `npm run check`             | Check application TypeScript.                                                             |
| `npm test`                  | Run backend and unit tests.                                                               |
| `npm run build`             | Build the Cloudflare Worker and frontend assets.                                          |
| `npm run test:e2e`          | Run browser integration tests against a local Worker.                                     |
| `npm run extension:install` | Install locked extension dependencies.                                                    |
| `npm run extension:test`    | Compile and test the extension.                                                           |
| `npm run deploy:dry-run`    | Build and check Cloudflare deployment packaging.                                          |
| `npm run deploy`            | Install application dependencies, build, and deploy to the configured Cloudflare account. |

Browser tests require the local schema and demo seed plus Playwright Chromium. See the [application testing instructions](src/site/README.md#testing) for the complete setup.

## Deploy your own instance

Configure `src/site/.env` with your Cloudflare account credentials, D1 database ID, OAuth KV namespace ID, Worker name, domains, and application settings. Follow the [Cloudflare deployment guide](src/site/README.md#deploy-to-cloudflare) to create resources and apply migrations before deploying.

Deployment reads `.env` values and keeps Cloudflare credentials out of application variables and browser data. A dry run checks packaging without uploading code or applying remote migrations.

## Contribute

Open a [GitHub issue](https://github.com/corridora/freebin/issues) for a reproducible bug or feature proposal. Pull requests should explain the behavior change and include the relevant checks from [CONTRIBUTING.md](CONTRIBUTING.md).

[Pull request CI](.github/workflows/pr-ci.yml) checks the application, Worker packaging, browser journeys, extension, and diff hygiene.

## License

[MIT](LICENSE).
