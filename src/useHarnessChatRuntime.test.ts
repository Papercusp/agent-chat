// @vitest-environment jsdom
/**
 * useHarnessChatRuntime.test.ts — P-014 of test-coverage-rest-non-critical. The
 * harness chat runtime hook: localStorage persistence, clear, the empty-input
 * guard, and the send → SSE-stream → finalize flow (real parseSseStream over a
 * mocked fetch ReadableStream). The assistant-ui runtime adapter is mocked — the
 * chat logic is what's under test, not that integration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@assistant-ui/react', () => ({
  useExternalStoreRuntime: vi.fn(() => ({ __fake: 'runtime' })),
}));

import { useHarnessChatRuntime, type HarnessMsg } from './useHarnessChatRuntime';

const KEY = 'test-chat-key';
type Opts = Parameters<typeof useHarnessChatRuntime>[0];
const opts = (over: Partial<Opts> = {}): Opts => ({
  slug: 'papercup',
  endpoint: 'architect/chat',
  storageKey: KEY,
  ...over,
});

/** A fetch Response whose body streams the given SSE text chunks, then closes. */
function sseResponse(...chunks: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

// The runtime env (Node 25's experimental localStorage) shadows jsdom's and
// lacks a working clear(); stub a clean in-memory Storage per test. The hook
// reads the bare global `localStorage`, so this drives both sides.
function makeStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useHarnessChatRuntime', () => {
  it('starts with no messages and not running', () => {
    const { result } = renderHook(() => useHarnessChatRuntime(opts()));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isRunning).toBe(false);
  });

  it('loads persisted messages from localStorage on mount', () => {
    const seed: HarnessMsg[] = [{ role: 'user', content: 'hi', ts: 1 }];
    localStorage.setItem(KEY, JSON.stringify(seed));
    const { result } = renderHook(() => useHarnessChatRuntime(opts()));
    expect(result.current.messages).toEqual(seed);
  });

  it('clear() empties messages (persist effect leaves an empty list in storage)', () => {
    localStorage.setItem(KEY, JSON.stringify([{ role: 'user', content: 'x', ts: 1 }]));
    const { result } = renderHook(() => useHarnessChatRuntime(opts()));
    act(() => result.current.clear());
    expect(result.current.messages).toEqual([]);
    // clear() removeItem's the key, but the messages-change persist effect then
    // re-writes the now-empty list — so the stored value is [] (cleared), not gone.
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual([]);
  });

  it('sendText ignores empty / whitespace input (no fetch)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useHarnessChatRuntime(opts()));
    await act(async () => {
      await result.current.sendText('   ');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('sendText posts the turn, streams the reply, finalizes both messages, infers the title', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(
        'event: delta\ndata: Hello\n\n',
        'event: delta\ndata: World\n\n',
        'event: done\ndata: {}\n\n',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onTitle = vi.fn();
    const { result } = renderHook(() =>
      useHarnessChatRuntime(opts({ onThreadTitleInferred: onTitle })),
    );

    await act(async () => {
      await result.current.sendText('do it');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/agent-tools/architect/chat');
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toMatchObject({ harnessSlug: 'papercup', message: 'do it' });

    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(result.current.messages[0].content).toBe('do it');
    expect(result.current.messages[1].content).toBe('HelloWorld'); // deltas accumulated
    expect(result.current.isRunning).toBe(false);
    expect(onTitle).toHaveBeenCalledWith('do it'); // first turn → title inferred
  });
});
