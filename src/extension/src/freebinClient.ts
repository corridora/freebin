export interface FreebinBin {
  binId: string;
  name: string;
  interactionCount?: number;
  createdAt?: string;
  url?: string;
}

export interface FreebinInteraction {
  id?: string;
  method?: string;
  path?: string;
  timestamp?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | string[]>;
  body?: string | null;
  contentType?: string | null;
  remoteAddress?: string;
  sizeBytes?: number;
}

export function buildApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function isAllowedServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const loopback = hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.startsWith('127.')
      || hostname === '0.0.0.0'
      || hostname === '::1'
      || hostname === '[::1]';
    if (loopback) return url.protocol === 'http:' || url.protocol === 'https:';
    return url.protocol === 'https:' && hostname === 'freebin.org';
  } catch {
    return false;
  }
}

export class FreebinClient {
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://freebin.org') {
    if (!apiKey.trim()) throw new Error('A Freebin API key is required.');
    if (!isAllowedServiceUrl(baseUrl)) {
      throw new Error('Freebin URLs must use HTTPS, except HTTP loopback URLs for local development.');
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = buildApiUrl(this.baseUrl, path);
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': 'freebin-vscode-extension/1.0.0',
          ...(options.headers || {})
        }
      });
    } catch (error) {
      const possibleCause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
      const cause = possibleCause instanceof Error ? possibleCause.message : '';
      const detail = cause || (error instanceof Error ? error.message : String(error));
      throw new Error(`Unable to reach Freebin at ${new URL(url).host}: ${detail}`);
    }
    const text = await response.text();
    const data = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();
    if (!response.ok) throw new Error(data?.error || `Freebin API error: ${response.status} ${response.statusText}`);
    return data as T;
  }

  async listBins(): Promise<FreebinBin[]> {
    return (await this.request<{ bins?: FreebinBin[] }>('/api/v1/bins')).bins || [];
  }

  async createBin(name: string): Promise<{ bin?: FreebinBin; inspectUrl?: string }> {
    return this.request('/api/v1/bins', {
      method: 'POST',
      body: JSON.stringify({ name, termsAccepted: true })
    });
  }

  async listInteractions(binId: string, limit = 100): Promise<FreebinInteraction[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const result = await this.request<{ interactions?: FreebinInteraction[] }>(
      `/api/v1/bins/${encodeURIComponent(binId)}/interactions?limit=${safeLimit}`
    );
    return result.interactions || [];
  }
}
