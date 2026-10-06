import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiUrl, isAllowedServiceUrl } from '../freebinClient';

test('buildApiUrl normalizes slashes', () => {
  assert.equal(buildApiUrl('https://freebin.org/', 'api/v1/bins'), 'https://freebin.org/api/v1/bins');
});

test('only freebin.org and loopback service URLs are allowed', () => {
  assert.equal(isAllowedServiceUrl('https://freebin.org'), true);
  assert.equal(isAllowedServiceUrl('http://localhost:8787'), true);
  assert.equal(isAllowedServiceUrl('http://app.localhost:8787'), true);
  assert.equal(isAllowedServiceUrl('http://127.0.0.1:8787'), true);
  assert.equal(isAllowedServiceUrl('http://[::1]:8787'), true);
  assert.equal(isAllowedServiceUrl('https://localhost:8787'), true);
  assert.equal(isAllowedServiceUrl('http://freebin.org'), false);
  assert.equal(isAllowedServiceUrl('https://freebin.org.evil.example'), false);
  assert.equal(isAllowedServiceUrl('https://evil.example'), false);
});
