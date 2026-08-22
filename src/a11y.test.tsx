// @vitest-environment jsdom
/**
 * a11y.test.tsx — P-015 of test-coverage-rest-non-critical.
 * vitest-axe accessibility checks for the agent-chat UI components:
 * PatchBlock (accept / expand buttons), PromoteBlock (promote button),
 * and the splitActionBlocks parser utility.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { ActionBlock } from './HarnessChat';
import { splitActionBlocks } from './HarnessChat';
import { PatchBlock } from './PatchBlock';
import { PromoteBlock } from './PromoteBlock';

// Stub sonner + fetch so components don't throw on missing globals.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '', json: async () => ({}) }) as any;

afterEach(cleanup);

function makeBlock(tag: string, content: string, i = 0): ActionBlock {
  return { kind: 'action', tag, content, blockKey: `b-${i}` };
}

// ─── splitActionBlocks (pure-logic, no DOM) ──────────────────────────────────

describe('splitActionBlocks', () => {
  it('returns a single text part for plain text', () => {
    const parts = splitActionBlocks('hello world', 'msg1');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ kind: 'text', text: 'hello world' });
  });

  it('extracts one action block and surrounding text', () => {
    const input = 'before\n```patch:SPEC.md\nbody\n```\nafter';
    const parts = splitActionBlocks(input, 'msg2');
    expect(parts.some((p) => p.kind === 'action' && p.tag === 'patch:SPEC.md')).toBe(true);
    expect(parts.some((p) => p.kind === 'text' && p.text.includes('before'))).toBe(true);
    expect(parts.some((p) => p.kind === 'text' && p.text.includes('after'))).toBe(true);
  });

  it('extracts multiple action blocks', () => {
    const input = '```patch:SPEC.md\nA\n```\n```note:supervisor\nB\n```';
    const parts = splitActionBlocks(input, 'msg3');
    const actions = parts.filter((p) => p.kind === 'action');
    expect(actions).toHaveLength(2);
  });

  it('returns plain text when no fenced block present', () => {
    const parts = splitActionBlocks('', 'msg4');
    expect(parts).toHaveLength(1);
    expect(parts[0].kind).toBe('text');
  });
});

// ─── PatchBlock a11y ─────────────────────────────────────────────────────────

describe('PatchBlock (a11y)', () => {
  it('patch block is accessible in idle state', async () => {
    const block = makeBlock('patch:SPEC.md', 'const x = 1;');
    const { container } = render(<PatchBlock slug="demo" block={block} />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('proposal block with summary is accessible', async () => {
    const block = makeBlock(
      'proposal:SPEC.md',
      'SUMMARY: Adds new endpoint\n---\nsome body content',
    );
    const { container } = render(<PatchBlock slug="demo" block={block} />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('note block is accessible', async () => {
    const block = makeBlock('note:supervisor', 'Short supervisor note');
    const { container } = render(<PatchBlock slug="demo" block={block} />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});

// ─── PromoteBlock a11y ───────────────────────────────────────────────────────

describe('PromoteBlock (a11y)', () => {
  it('promote:feature block is accessible', async () => {
    const block = makeBlock('promote:feature', '{"title":"New feature"}');
    const { container } = render(<PromoteBlock slug="demo" block={block} />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('promote:spec block is accessible', async () => {
    const block = makeBlock('promote:spec', '## Spec content\nDetails here.');
    const { container } = render(<PromoteBlock slug="demo" block={block} />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});
