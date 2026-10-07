# Freebin VS Code extension

The Freebin Helper extension connects request bins to VS Code. Use it to create bins, inspect captured traffic, and open the browser inspector while debugging an integration.

## Connect a bin

1. Create an account and API key on your Freebin instance. The [quickstart](../../quickstart.md) covers the setup.
2. Open the Freebin view in the Activity Bar.
3. Run **Freebin: Connect Bin** and paste the bin's inspector or capture URL.
4. Enter an owner account API key when prompted.
5. Select the bin and run **Freebin: Open Inspector** to browse recent requests.

To create bins from VS Code, first run **Freebin: Set Default API Key**, then **Freebin: Create Bin**. Keys are stored in VS Code SecretStorage. Removing a connection removes its local settings and stored key; it does not delete the remote bin.

The inspector shows up to 100 recent requests with search and method filtering. Captured data is rendered as text under a restrictive content security policy.

The inspector matches Freebin's cream, green, and orange styling, including method badges and request details. Inter and DM Mono fonts are bundled for offline use; the bin sidebar and VS Code command dialogs follow your editor theme. Refresh, search, method filtering, and expandable details remain the inspector's controls.

## Commands

| Command                        | Purpose                                         |
| ------------------------------ | ----------------------------------------------- |
| Freebin: Create Bin            | Create a bin using the default account API key. |
| Freebin: Connect Bin           | Save a connection to an existing bin.           |
| Freebin: Open Inspector        | Inspect recent captures in a webview.           |
| Freebin: Open Bin in Browser   | Open the full browser inspector.                |
| Freebin: Copy Bin URL          | Copy the bin URL.                               |
| Freebin: Set Default API Key   | Store the account key used to create bins.      |
| Freebin: Set Bin API Key       | Store or replace a connection's key.            |
| Freebin: Test Connection       | Check access to the configured service.         |
| Freebin: Remove Bin Connection | Remove local connection state.                  |
| Freebin: Configure Settings    | Open extension settings.                        |

## Configuration

`freebin.baseUrl` defaults to `https://freebin.org`. The extension accepts that HTTPS host and explicit loopback development services. Custom remote self-hosted domains are not currently accepted by its URL policy.

For the local Worker started with `npm run dev -- --port 8788` in the web application directory, set:

```json
{
  "freebin.baseUrl": "http://127.0.0.1:8788"
}
```

The Docker environment uses port 8787 instead. Connection URLs can point to `/bin/:id` or `/b/:id`.

Optional machine settings can describe connections without embedding keys:

```json
{
  "freebin.connections": [
    {
      "binId": "abc123def456",
      "name": "Payments dev",
      "url": "https://freebin.org/bin/abc123def456"
    }
  ]
}
```

Replace the example bin ID and URL with your own values. Set its key through **Freebin: Set Bin API Key**. Settings are machine-scoped so a repository cannot redirect stored credentials. The optional plaintext `apiKey` setting is supported, but SecretStorage avoids placing keys in settings files or Settings Sync.

## Development

Use Node.js 24 or newer for repository tooling and VS Code 1.92 or newer. Install and test from the repository root:

```bash
npm run extension:install
npm run extension:test
```

Open the repository root in VS Code and select **Run Freebin Extension** in Run and Debug. Press `F5` to compile the extension and launch an Extension Development Host using the checked-in [launch configuration](../../.vscode/launch.json).

For a local integration test, start the [web application](../site/README.md#local-development), create a local account/bin/API key, and configure `freebin.baseUrl` as shown above.

From this directory, the available build commands are:

```bash
npm ci
npm run compile
npm run watch
npm test
```

`compile` builds TypeScript into `out/` and copies webview assets. `watch` recompiles TypeScript while editing; rerun `compile` after changing webview assets. Tests cover the API client and webview behavior.

## Source layout

| File                                                   | Responsibility                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| [src/extension.ts](src/extension.ts)                   | Commands, connection state, SecretStorage, and inspector panels. |
| [src/freebinClient.ts](src/freebinClient.ts)           | API calls and service URL policy.                                |
| [src/inspectorWebview.ts](src/inspectorWebview.ts)     | Webview setup and captured-data rendering.                       |
| [src/inspectorWebview.html](src/inspectorWebview.html) | Inspector markup and controls.                                   |
| [src/test/](src/test/)                                 | Client and webview tests.                                        |
| [resources/fonts/](resources/fonts/)                   | Bundled Latin fonts and their SIL Open Font License notices.     |

Follow the [contribution guide](../../CONTRIBUTING.md) for pull requests. This extension is part of [corridora/freebin.org](https://github.com/corridora/freebin) and uses the [MIT license](LICENSE).
