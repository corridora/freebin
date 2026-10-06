import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { FreebinClient, isAllowedServiceUrl } from './freebinClient';
import { renderInspectorHtml } from './inspectorWebview';

const CONNECTIONS_KEY = 'freebin.connections.saved';
const CURRENT_BIN_KEY = 'freebin.currentBinId';

interface Connection {
  binId: string;
  name: string;
  url: string;
  apiKey?: string;
}

class BinItem extends vscode.TreeItem {
  readonly contextValue = 'freebin.bin';

  constructor(readonly connection: Connection) {
    super(connection.name, vscode.TreeItemCollapsibleState.None);
    this.description = connection.url;
    this.tooltip = `${connection.name}\n${connection.url}`;
    this.iconPath = new vscode.ThemeIcon('radio-tower');
    this.command = {
      command: 'freebin.openInspector',
      title: 'Open Freebin Inspector',
      arguments: [this]
    };
  }
}

class BinProvider implements vscode.TreeDataProvider<BinItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly context: vscode.ExtensionContext) {}
  refresh() { this.changed.fire(); }
  dispose() { this.changed.dispose(); }
  getTreeItem(item: BinItem) { return item; }
  getChildren() { return connections(this.context).map((connection) => new BinItem(connection)); }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new BinProvider(context);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const inspectorPanels = new Map<string, {
    panel: vscode.WebviewPanel;
    refresh: () => Promise<void>;
  }>();
  status.command = 'freebin.testConnection';
  status.show();
  refreshStatus(status, context);

  const selectConnection = async (item?: BinItem): Promise<Connection | undefined> => {
    if (item) return item.connection;
    const available = connections(context);
    if (!available.length) {
      vscode.window.showWarningMessage('No Freebin bins are connected.');
      return undefined;
    }
    const currentId = context.globalState.get<string>(CURRENT_BIN_KEY);
    const picked = await vscode.window.showQuickPick(
      available.map((connection) => ({
        label: connection.name,
        description: connection.url,
        connection,
        picked: connection.binId === currentId
      })),
      { placeHolder: 'Choose a Freebin bin' }
    );
    return picked?.connection;
  };

  const saveConnection = async (connection: Connection, apiKey?: string) => {
    const saved = storedConnections(context).filter((item) => item.binId !== connection.binId);
    await context.globalState.update(CONNECTIONS_KEY, [connection, ...saved].slice(0, 20));
    await context.globalState.update(CURRENT_BIN_KEY, connection.binId);
    if (apiKey) await context.secrets.store(secretKey(connection.binId), apiKey);
    provider.refresh();
    refreshStatus(status, context);
  };

  context.subscriptions.push(
    status,
    provider,
    vscode.window.registerTreeDataProvider('freebinView', provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('freebin')) {
        provider.refresh();
        refreshStatus(status, context);
      }
    }),
    vscode.commands.registerCommand('freebin.setDefaultApiKey', async () => {
      const value = await vscode.window.showInputBox({
        title: 'Freebin API key',
        prompt: 'This key is stored in VS Code SecretStorage.',
        password: true,
        ignoreFocusOut: true
      });
      if (value?.trim()) {
        await context.secrets.store('freebin.apiKey', value.trim());
        refreshStatus(status, context);
        vscode.window.showInformationMessage('Default Freebin API key saved securely.');
      }
    }),
    vscode.commands.registerCommand('freebin.connectBin', async () => {
      const value = await vscode.window.showInputBox({
        title: 'Connect a Freebin bin',
        prompt: 'Enter its inspector or capture URL.',
        placeHolder: 'https://freebin.org/bin/YOUR_BIN_ID',
        ignoreFocusOut: true
      });
      if (!value?.trim() || !isAllowedServiceUrl(value.trim())) {
        if (value?.trim()) vscode.window.showErrorMessage('Use HTTPS, or HTTP on a loopback address for local development.');
        return;
      }
      const binId = extractBinId(value.trim());
      if (!binId) {
        vscode.window.showErrorMessage('The URL does not contain a valid Freebin bin ID.');
        return;
      }
      const apiKey = await vscode.window.showInputBox({
        title: `API key for ${binId}`,
        password: true,
        ignoreFocusOut: true
      });
      if (!apiKey?.trim()) return;
      const origin = new URL(value.trim()).origin;
      let name = `Bin ${binId}`;
      try {
        const bins = await new FreebinClient(apiKey.trim(), origin).listBins();
        name = bins.find((bin) => bin.binId === binId)?.name || name;
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        return;
      }
      await saveConnection({ binId, name, url: `${origin}/bin/${encodeURIComponent(binId)}` }, apiKey.trim());
      vscode.window.showInformationMessage(`Connected to ${name}.`);
    }),
    vscode.commands.registerCommand('freebin.createBin', async () => {
      const name = await vscode.window.showInputBox({
        title: 'Create a Freebin bin',
        prompt: 'Enter a friendly name.',
        placeHolder: 'Webhook development'
      });
      if (!name?.trim()) return;
      const apiKey = await context.secrets.get('freebin.apiKey');
      if (!apiKey) {
        vscode.window.showErrorMessage('Set a default Freebin API key before creating a bin.');
        return;
      }
      try {
        const baseUrl = configuredBaseUrl();
        const result = await new FreebinClient(apiKey, baseUrl).createBin(name.trim());
        if (!result.bin?.binId) throw new Error('Freebin created no usable bin.');
        const connection = {
          binId: result.bin.binId,
          name: result.bin.name || name.trim(),
          url: result.inspectUrl || `${baseUrl}/bin/${encodeURIComponent(result.bin.binId)}`
        };
        await saveConnection(connection, apiKey);
        vscode.window.showInformationMessage(`Freebin ready: ${connection.url}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Freebin create failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
    vscode.commands.registerCommand('freebin.openInspector', async (item?: BinItem) => {
      const connection = await selectConnection(item);
      if (!connection) return;
      await context.globalState.update(CURRENT_BIN_KEY, connection.binId);
      const existing = inspectorPanels.get(connection.binId);
      if (existing) {
        existing.panel.reveal(vscode.ViewColumn.One);
        await existing.refresh();
        refreshStatus(status, context);
        return;
      }
      const panel = vscode.window.createWebviewPanel(
        'freebinInspector',
        `Freebin: ${connection.name}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'resources')]
        }
      );
      let refreshing = false;
      const fetchInteractions = async () => {
        const client = await clientFor(context, connection);
        return client.listInteractions(connection.binId, 100);
      };
      const refreshPanel = async () => {
        if (refreshing) return;
        refreshing = true;
        try {
          await panel.webview.postMessage({ type: 'requests', interactions: await fetchInteractions() });
        } catch (error) {
          await panel.webview.postMessage({
            type: 'refreshError',
            message: error instanceof Error ? error.message : String(error)
          });
        } finally {
          refreshing = false;
        }
      };
      try {
        panel.webview.html = renderInspectorHtml(
          await fetchInteractions(),
          connection.url,
          panel.webview.cspSource,
          undefined,
          panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'resources', 'fonts')).toString()
        );
      } catch (error) {
        panel.webview.html = errorHtml(error instanceof Error ? error.message : String(error), panel.webview.cspSource);
      }
      inspectorPanels.set(connection.binId, { panel, refresh: refreshPanel });
      panel.onDidDispose(() => {
        if (inspectorPanels.get(connection.binId)?.panel === panel) {
          inspectorPanels.delete(connection.binId);
        }
      });
      panel.webview.onDidReceiveMessage(async (message: unknown) => {
        if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== 'refresh') return;
        await refreshPanel();
      });
      refreshStatus(status, context);
    }),
    vscode.commands.registerCommand('freebin.openBinInBrowser', async (item?: BinItem) => {
      const connection = await selectConnection(item);
      if (connection) await vscode.env.openExternal(vscode.Uri.parse(connection.url));
    }),
    vscode.commands.registerCommand('freebin.copyBinUrl', async (item?: BinItem) => {
      const connection = await selectConnection(item);
      if (connection) {
        await vscode.env.clipboard.writeText(connection.url);
        vscode.window.showInformationMessage('Freebin URL copied.');
      }
    }),
    vscode.commands.registerCommand('freebin.setBinApiKey', async (item?: BinItem) => {
      const connection = await selectConnection(item);
      if (!connection) return;
      const value = await vscode.window.showInputBox({
        title: `API key for ${connection.name}`,
        password: true,
        ignoreFocusOut: true
      });
      if (value?.trim()) {
        await context.secrets.store(secretKey(connection.binId), value.trim());
        refreshStatus(status, context);
        vscode.window.showInformationMessage(`API key saved for ${connection.name}.`);
      }
    }),
    vscode.commands.registerCommand('freebin.removeConnection', async (item?: BinItem) => {
      const connection = await selectConnection(item);
      if (!connection) return;
      const answer = await vscode.window.showWarningMessage(
        `Remove ${connection.name} from VS Code? The online bin will not be deleted.`,
        { modal: true },
        'Remove Connection'
      );
      if (answer !== 'Remove Connection') return;
      await context.secrets.delete(secretKey(connection.binId));
      await context.globalState.update(
        CONNECTIONS_KEY,
        storedConnections(context).filter((entry) => entry.binId !== connection.binId)
      );
      if (context.globalState.get(CURRENT_BIN_KEY) === connection.binId) {
        await context.globalState.update(CURRENT_BIN_KEY, undefined);
      }
      provider.refresh();
      refreshStatus(status, context);
    }),
    vscode.commands.registerCommand('freebin.testConnection', async (item?: BinItem) => {
      const connection = await selectConnection(item);
      if (!connection) return;
      try {
        await (await clientFor(context, connection)).listBins();
        vscode.window.showInformationMessage(`Connected to ${connection.name}.`);
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }),
    vscode.commands.registerCommand('freebin.openSettings', () => {
      return vscode.commands.executeCommand('workbench.action.openSettings', 'Freebin');
    })
  );
}

function configuredBaseUrl() {
  const value = vscode.workspace.getConfiguration('freebin').get<string>('baseUrl') || 'https://freebin.org';
  if (!isAllowedServiceUrl(value)) throw new Error('The configured Freebin base URL is not allowed.');
  return value.replace(/\/$/, '');
}

function configuredConnections(): Connection[] {
  const values = vscode.workspace.getConfiguration('freebin').get<unknown[]>('connections') || [];
  return values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const candidate = value as Partial<Connection>;
    const binId = String(candidate.binId || '').trim();
    const url = String(candidate.url || '').trim();
    if (!validBinId(binId) || !isAllowedServiceUrl(url)) return [];
    const origin = new URL(url).origin;
    return [{
      binId,
      name: String(candidate.name || `Bin ${binId}`).trim().slice(0, 60),
      url: `${origin}/bin/${encodeURIComponent(binId)}`,
      ...(candidate.apiKey?.trim() ? { apiKey: candidate.apiKey.trim() } : {})
    }];
  });
}

function storedConnections(context: vscode.ExtensionContext): Connection[] {
  return context.globalState.get<Connection[]>(CONNECTIONS_KEY) || [];
}

function connections(context: vscode.ExtensionContext): Connection[] {
  const all = [...configuredConnections(), ...storedConnections(context)];
  return all.filter((connection, index) =>
    all.findIndex((candidate) => candidate.binId === connection.binId) === index
  );
}

async function clientFor(context: vscode.ExtensionContext, connection: Connection) {
  const apiKey = await context.secrets.get(secretKey(connection.binId))
    || connection.apiKey;
  if (!apiKey) throw new Error(`No API key is stored for ${connection.name}.`);
  return new FreebinClient(apiKey, new URL(connection.url).origin);
}

function refreshStatus(status: vscode.StatusBarItem, context: vscode.ExtensionContext) {
  const current = connections(context).find((item) => item.binId === context.globalState.get(CURRENT_BIN_KEY));
  status.text = current ? '$(radio-tower) Freebin' : '$(plug) Freebin';
  status.tooltip = current ? `${current.name}\n${current.url}` : 'No Freebin bin selected';
}

function validBinId(value: string) {
  return /^[a-z0-9]{6,64}$/i.test(value);
}

function extractBinId(value: string) {
  try {
    const match = new URL(value).pathname.match(/^\/(?:b|bin)\/([^/?#]+)/);
    const binId = match?.[1] ? decodeURIComponent(match[1]) : '';
    return validBinId(binId) ? binId : undefined;
  } catch {
    return undefined;
  }
}

function secretKey(binId: string) {
  return `freebin.apiKey.bin.${binId}`;
}

function errorHtml(message: string, cspSource: string) {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nonce = randomBytes(16).toString('base64url');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src ${cspSource} 'nonce-${nonce}'"><title>Freebin Inspector</title><style nonce="${nonce}">body{margin:0;background:#f4f0e7;color:#17231d;font:14px/1.6 Inter,system-ui,sans-serif}main{max-width:760px;margin:48px auto;padding:24px}h1{font-size:28px;letter-spacing:-.04em}p{padding:20px;border:1px solid #d5d9d4;border-radius:12px;background:#fffdf8;color:#b73520;overflow-wrap:anywhere}.brand{font-weight:800;font-size:18px}.brand span{color:#ff5b3d}</style></head><body><main><div class="brand">freebin<span>.org</span></div><h1>Freebin Inspector</h1><p role="alert">${escaped}</p></main></body></html>`;
}

export function deactivate() {}
