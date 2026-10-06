import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FreebinInteraction } from './freebinClient';

const template = readFileSync(resolve(__dirname, 'inspectorWebview.html'), 'utf8');

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function replaceToken(source: string, token: string, value: string): string {
  return source.split(token).join(value);
}

function fontFaces(baseUri?: string): string {
  if (!baseUri) return '';
  // Webview resource URIs are trusted; escape CSS delimiters before interpolation.
  const base = baseUri.replace(/[\\"'\r\n<>]/g, (value) => encodeURIComponent(value));
  return [
    ['Inter', '400 800', 'inter-latin.woff2'],
    ['DM Mono', '400', 'dm-mono-latin-400.woff2'],
    ['DM Mono', '500', 'dm-mono-latin-500.woff2']
  ].map(([family, weight, file]) => `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("${base}/${file}") format("woff2"); }`).join('\n');
}

export function renderInspectorHtml(
  interactions: FreebinInteraction[],
  binUrl: string,
  cspSource: string,
  nonce = randomBytes(16).toString('base64url'),
  fontBaseUri?: string
): string {
  return [
    ['{{CSP_SOURCE}}', cspSource],
    ['{{NONCE}}', nonce],
    ['{{FONT_FACES}}', fontFaces(fontBaseUri)],
    ['{{BIN_URL}}', escapeHtml(binUrl)],
    ['{{INTERACTIONS_JSON}}', safeJson(interactions)]
  ].reduce((html, [token, value]) => replaceToken(html, token, value), template);
}
