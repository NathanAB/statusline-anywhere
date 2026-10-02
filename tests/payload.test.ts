import { expect, test } from 'claude-code/testing'
import { buildStatusInput, modelDisplayName, transcriptPath } from '../hooks/payload'

test('model ids read the way Claude Code names them', () => {
  expect(modelDisplayName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelDisplayName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelDisplayName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(modelDisplayName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelDisplayName('some-custom-model')).toBe('some-custom-model')
})

test('the transcript sits under the config dir, keyed by the project root', () => {
  expect(
    transcriptPath({
      configDir: '/home/u/.claude',
      root: '/home/u/repos/statuslin.es',
      sessionId: 'abc',
    }),
  ).toBe('/home/u/.claude/projects/-home-u-repos-statuslin-es/abc.jsonl')
})

const FACTS = {
  sessionId: 'abc',
  root: '/work/repo',
  cwd: '/work/repo/src',
  model: 'claude-opus-5-5',
  version: '2.1.287',
  configDir: '/home/u/.claude',
  now: 1_790_000_600_000,
  usage: {
    startedAt: 1_790_000_000_000,
    context: { tokens: 66_000, window: 200_000, percent: 33 },
    rateLimits: [
      {
        kind: 'five_hour',
        percentUsed: 23.5,
        resetsAt: '2026-09-21T15:00:00Z',
      },
      { kind: 'seven_day', percentUsed: 41.2 },
    ],
    cost: { usd: 37.02 },
  },
}

test('the input carries the fields status line scripts read', () => {
  expect(buildStatusInput(FACTS)).toEqual({
    session_id: 'abc',
    transcript_path: '/home/u/.claude/projects/-work-repo/abc.jsonl',
    cwd: '/work/repo/src',
    model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
    workspace: {
      current_dir: '/work/repo/src',
      project_dir: '/work/repo',
      added_dirs: [],
    },
    version: '2.1.287',
    cost: { total_cost_usd: 37.02, total_duration_ms: 600_000 },
    context_window: {
      total_input_tokens: 66_000,
      context_window_size: 200_000,
      used_percentage: 33,
      remaining_percentage: 67,
    },
    exceeds_200k_tokens: false,
    rate_limits: {
      five_hour: { used_percentage: 23.5, resets_at: 1_790_002_800 },
      seven_day: { used_percentage: 41.2 },
    },
  })
})

test('before the first reply there is no context reading yet', () => {
  const input = buildStatusInput({
    ...FACTS,
    usage: {
      startedAt: FACTS.usage.startedAt,
      context: { window: 200_000 },
      rateLimits: [],
    },
  })
  expect(input.context_window).toEqual({
    total_input_tokens: 0,
    context_window_size: 200_000,
    used_percentage: null,
    remaining_percentage: null,
  })
  expect(input.cost.total_cost_usd).toBe(0)
  expect(input.rate_limits).toEqual({})
})
