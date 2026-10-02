import assert from 'node:assert/strict';
import test from 'node:test';
import { createVersionPoller } from '../src/lib/versionPoller.ts';

function setup(overrides = {}) {
  const state = { version: 'a', active: true, reads: 0, refreshes: 0, errors: [] };
  const poller = createVersionPoller({
    isActive: () => state.active,
    readVersion: async () => { state.reads++; return state.version; },
    refresh: async () => { state.refreshes++; return true; },
    onError: error => state.errors.push(error),
    ...overrides,
  });
  return { state, poller };
}

test('loads once, skips unchanged data, then loads a new version', async () => {
  const { state, poller } = setup();
  for (let i = 0; i < 10; i++) await poller.poll();
  assert.equal(state.reads, 10);
  assert.equal(state.refreshes, 1);
  state.version = 'b';
  await poller.poll();
  await poller.poll();
  assert.equal(state.refreshes, 2);
});

test('hidden tabs pause; returning catches changes', async () => {
  const { state, poller } = setup();
  await poller.poll();
  state.active = false;
  state.version = 'b';
  await poller.poll();
  assert.equal(state.reads, 1);
  state.active = true;
  await poller.poll();
  assert.equal(state.refreshes, 2);
});

test('failed data refresh is retried for the same version', async () => {
  let calls = 0;
  const { poller } = setup({ refresh: async () => ++calls > 1 });
  await poller.poll();
  await poller.poll();
  await poller.poll();
  assert.equal(calls, 2);
});

test('version request failure does not permanently stop polling', async () => {
  let calls = 0;
  const { state, poller } = setup({ readVersion: async () => {
    if (++calls === 1) throw new Error('offline');
    return 'a';
  } });
  await poller.poll();
  await poller.poll();
  assert.equal(state.errors.length, 1);
  assert.equal(state.refreshes, 1);
});

test('does not overlap requests or refresh after cleanup', async () => {
  let resolve;
  let reads = 0;
  const { state, poller } = setup({ readVersion: () => {
    reads++;
    return new Promise(r => { resolve = r; });
  } });
  const pending = poller.poll();
  await poller.poll();
  assert.equal(reads, 1);
  poller.stop();
  resolve('a');
  await pending;
  await poller.poll();
  assert.equal(state.refreshes, 0);
  assert.equal(reads, 1);
});

test('change during a download is picked up on the next tick', async () => {
  const { state, poller } = setup({ refresh: async () => {
    state.refreshes++;
    state.version = 'b';
    return true;
  } });
  await poller.poll();
  await poller.poll();
  await poller.poll();
  assert.equal(state.refreshes, 2);
});
