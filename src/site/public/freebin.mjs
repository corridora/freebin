#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const [command, ...argv] = process.argv.slice(2);
const baseUrl = (process.env.FREEBIN_URL || 'https://freebin.org').replace(/\/+$/, '');
const apiKey = process.env.FREEBIN_API_KEY || '';

function usage() { console.log(`freebin CLI

Environment: FREEBIN_API_KEY (required), FREEBIN_URL (default https://freebin.org)

Commands:
  bins
  create <name>
  send <bin-id> [path] [json]
  requests <bin-id> [limit|all]
  watch <bin-id> [--interval <ms>] [--include-existing]
  export <bin-id> [--output <file>]
  replay <bin-id> <request-id> <https-url> [--method M] [--path P]
    [--query JSON] [--headers JSON] [--body TEXT | --body-file FILE]
  local-forward <bin-id> <local-url> [--interval <ms>] [--include-existing]
  assert <bin-id> [--method M] [--path GLOB] [--header name=value]
    [--body-contains TEXT] [--body-json path=value] [--since ISO]
    [--timeout <seconds>] [--interval <ms>] [--include-existing]
  delete-request <bin-id> <request-id>

Repeat --header, --body-contains, and --body-json as needed. Assertion exit
codes: 0 match, 1 usage/operation error, 2 timeout.`); }

function parseArgs(values) {
  const positionals = [], options = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) { positionals.push(value); continue; }
    const [key, inline] = value.slice(2).split(/=(.*)/s, 2);
    if (['include-existing', 'help'].includes(key)) { options[key] = true; continue; }
    const optionValue = inline ?? values[++i];
    if (optionValue === undefined || optionValue.startsWith('--')) throw new Error(`Missing value for --${key}`);
    if (['header', 'body-contains', 'body-json'].includes(key)) options[key] = [...(options[key] || []), optionValue];
    else options[key] = optionValue;
  }
  return { positionals, options };
}

async function request(path, init = {}) {
  if (!apiKey) throw new Error('Set FREEBIN_API_KEY before using the CLI.');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: {
    authorization: `Bearer ${apiKey}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers
  }});
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text}`);
  return text && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : { status: response.status, body: text };
}

const encoded = (value) => encodeURIComponent(value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jsonLine = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const listRequests = (binId, limit = 100) => request(`/api/v1/bins/${encoded(binId)}/interactions?limit=${encoded(String(limit))}`);
function positive(value, fallback, name) { const number = value === undefined ? fallback : Number(value); if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be positive`); return number; }

async function pollNew(binId, options, handler) {
  const interval = positive(options.interval, 1000, '--interval');
  const initial = await listRequests(binId, 'all');
  const seen = new Set(options['include-existing'] ? [] : initial.interactions.map(({ id }) => id));
  if (options['include-existing']) for (const item of [...initial.interactions].reverse()) { seen.add(item.id); await handler(item); }
  while (true) {
    await sleep(interval);
    const page = await listRequests(binId, 'all');
    for (const item of page.interactions.filter(({ id }) => !seen.has(id)).reverse()) { seen.add(item.id); await handler(item); }
  }
}

function objectOption(value, name) { try { const parsed = JSON.parse(value); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw 0; return parsed; } catch { throw new Error(`${name} must be a JSON object`); } }
function pair(value, name) { const i = value.indexOf('='); if (i < 1) throw new Error(`${name} must use name=value`); return [value.slice(0, i), value.slice(i + 1)]; }
function jsonPath(value, path) { return path.split('.').reduce((current, part) => current && typeof current === 'object' ? current[part] : undefined, value); }
function glob(value) { const escaped = value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.'); return new RegExp(`^${escaped}$`); }

function matches(item, options, defaultSince) {
  const since = options.since ? Date.parse(options.since) : defaultSince;
  if (!Number.isFinite(since)) throw new Error('--since must be an ISO date-time');
  if (Date.parse(item.timestamp) < since) return false;
  if (options.method && String(item.method).toUpperCase() !== options.method.toUpperCase()) return false;
  if (options.path && !glob(options.path).test(item.path)) return false;
  const headers = Object.fromEntries(Object.entries(item.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
  for (const expression of options.header || []) { const [key, value] = pair(expression, '--header'); if (headers[key.toLowerCase()] !== value) return false; }
  for (const value of options['body-contains'] || []) if (!String(item.body ?? '').includes(value)) return false;
  if ((options['body-json'] || []).length) {
    let body; try { body = JSON.parse(String(item.body ?? '')); } catch { return false; }
    for (const expression of options['body-json']) { const [path, expected] = pair(expression, '--body-json'); const actual = jsonPath(body, path); if ((typeof actual === 'object' ? JSON.stringify(actual) : String(actual)) !== expected) return false; }
  }
  return true;
}

function forwardTarget(origin, item) {
  const target = new URL(origin);
  target.pathname = `${target.pathname.replace(/\/$/, '')}/${String(item.path || '/').replace(/^\//, '')}`;
  for (const [key, value] of Object.entries(item.query || {})) for (const entry of Array.isArray(value) ? value : [value]) target.searchParams.append(key, String(entry));
  return target;
}
function safeHeaders(headers = {}) {
  const blocked = /^(host|authorization|cookie|content-length|transfer-encoding|connection|keep-alive|proxy-authenticate|proxy-authorization|te|trailer|upgrade|cf-ray|cf-connecting-ip|x-forwarded-for)$/i;
  const sensitive = /authorization|(^|[-_])(auth|cookie|credential|key|secret|signature|token)($|[-_])|api[-_]?key/i;
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.test(key) && !sensitive.test(key)).map(([key, value]) => [key, String(value)]));
}
function forwardBody(item) {
  if (item.body === null || ['GET', 'HEAD'].includes(item.method)) return undefined;
  const prefix = 'freebin:base64:';
  return typeof item.body === 'string' && item.body.startsWith(prefix) ? Buffer.from(item.body.slice(prefix.length), 'base64') : item.body;
}

try {
  const { positionals: args, options } = parseArgs(argv);
  if (options.help || ['help', '--help'].includes(command)) { usage(); process.exit(0); }
  let result;
  switch (command) {
    case 'bins': result = await request('/api/v1/bins'); break;
    case 'create': if (!args[0]) throw new Error('Usage: create <name>'); result = await request('/api/v1/bins', { method: 'POST', body: JSON.stringify({ name: args.join(' '), termsAccepted: true }) }); break;
    case 'send': { if (!args[0]) throw new Error('Usage: send <bin-id> [path] [json]'); const body = args[2] || '{"hello":"freebin"}'; JSON.parse(body); result = await request(`/b/${encoded(args[0])}/${(args[1] || 'events').replace(/^\/+/, '')}`, { method: 'POST', body }); break; }
    case 'requests': { if (!args[0]) throw new Error('Usage: requests <bin-id> [limit|all]'); const raw = args[1] || '50'; result = await listRequests(args[0], raw === 'all' ? 'all' : Math.min(Math.max(Number(raw) || 50, 1), 100)); break; }
    case 'watch': if (!args[0]) throw new Error('Usage: watch <bin-id>'); await pollNew(args[0], options, async (item) => jsonLine(item)); break;
    case 'export': { if (!args[0]) throw new Error('Usage: export <bin-id> [--output file]'); result = await request(`/api/v1/bins/${encoded(args[0])}/export`); if (options.output) { await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8'); console.error(`Exported to ${options.output}`); result = undefined; } break; }
    case 'replay': {
      if (!args[0] || !args[1] || !args[2]) throw new Error('Usage: replay <bin-id> <request-id> <https-url>');
      if (options.body !== undefined && options['body-file']) throw new Error('Use either --body or --body-file');
      const input = { url: args[2] };
      if (options.method) input.method = options.method; if (options.path) input.path = options.path;
      if (options.query) input.query = objectOption(options.query, '--query'); if (options.headers) input.headers = objectOption(options.headers, '--headers');
      if (options.body !== undefined) input.body = options.body; if (options['body-file']) input.body = await readFile(options['body-file'], 'utf8');
      result = await request(`/api/v1/bins/${encoded(args[0])}/interactions/${encoded(args[1])}/replay`, { method: 'POST', body: JSON.stringify(input) }); break;
    }
    case 'local-forward': {
      if (!args[0] || !args[1]) throw new Error('Usage: local-forward <bin-id> <local-url>');
      const origin = new URL(args[1]); if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('local-url must use http or https');
      await pollNew(args[0], options, async (item) => { const target = forwardTarget(origin, item), started = Date.now(); try { const response = await fetch(target, { method: item.method, headers: safeHeaders(item.headers), body: forwardBody(item), redirect: 'manual' }); jsonLine({ requestId: item.id, target: target.href, status: response.status, durationMs: Date.now() - started }); } catch (error) { jsonLine({ requestId: item.id, target: target.href, error: error instanceof Error ? error.message : 'Forward failed', durationMs: Date.now() - started }); } }); break;
    }
    case 'assert': {
      if (!args[0]) throw new Error('Usage: assert <bin-id> [predicates]');
      const started = Date.now(), timeout = positive(options.timeout, 30, '--timeout') * 1000, interval = positive(options.interval, 500, '--interval'), deadline = started + timeout;
      while (Date.now() <= deadline) { const page = await listRequests(args[0]); const match = page.interactions.find((item) => matches(item, options, options['include-existing'] ? 0 : started)); if (match) { console.log(JSON.stringify(match, null, 2)); process.exit(0); } await sleep(Math.min(interval, Math.max(0, deadline - Date.now()))); }
      console.error(`No matching request received within ${timeout / 1000} seconds.`); process.exit(2);
    }
    case 'delete-request': if (!args[0] || !args[1]) throw new Error('Usage: delete-request <bin-id> <request-id>'); result = await request(`/api/v1/bins/${encoded(args[0])}/interactions/${encoded(args[1])}`, { method: 'DELETE' }); break;
    default: usage(); process.exitCode = command ? 1 : 0;
  }
  if (result) console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
