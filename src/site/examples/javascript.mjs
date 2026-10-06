const baseUrl = process.env.FREEBIN_URL || 'https://freebin.org';
const apiKey = process.env.FREEBIN_API_KEY;

export async function freebin(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });
  if (!response.ok) throw new Error(`freebin API returned ${response.status}: ${await response.text()}`);
  return response.json();
}

export const listBins = () => freebin('/api/v1/bins');
export const createBin = (name) => freebin('/api/v1/bins', {
  method: 'POST',
  body: JSON.stringify({ name, termsAccepted: true })
});
export const listRequests = (binId, limit = 50) =>
  freebin(`/api/v1/bins/${encodeURIComponent(binId)}/interactions?limit=${limit}`);
