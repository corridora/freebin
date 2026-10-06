import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInspectorHtml } from '../inspectorWebview';

test('inspector safely encodes captured data and uses a restrictive CSP', () => {
  const html = renderInspectorHtml(
    [{ id: 'request1', method: 'POST', path: '/events</script>', body: '<img src=x onerror=alert(1)>' }],
    'https://freebin.org/bin/example1',
    'vscode-webview:',
    'test-nonce'
  );
  assert.match(html, /default-src 'none'/);
  assert.match(html, /test-nonce/);
  assert.match(html, /id="refresh"/);
  assert.match(html, /vscode\.postMessage\(\{ type: 'refresh' \}\)/);
  assert.match(html, /\\u003c\/script\\u003e/);
  assert.doesNotMatch(html, /\/events<\/script>/);
  assert.doesNotMatch(html, /\{\{(?:CSP_SOURCE|NONCE|BIN_URL|INTERACTIONS_JSON)\}\}/);
});
