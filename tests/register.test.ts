import type { ProcessRunResult, RenderSurface } from 'claude-code'
import { expect, type MountTarget, mock, type TestBody, test } from 'claude-code/testing'

const ESC = '\x1b'
const STDOUT = `${ESC}[38;5;173mOpus 5.5${ESC}[0m ${ESC}[36mrepo${ESC}[0m\nline two\n`

type StubOn = Parameters<TestBody>[1]
type Run = { argv: readonly string[]; init?: { cwd?: string; stdin?: string } }

// What $.process.run resolves to, for a stub
function ran(exitCode: number, stdout: string, stderr = ''): { value: ProcessRunResult } {
  return { value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } }
}

type Options = {
  surfaces?: RenderSurface[]
  statusLine?: Record<string, unknown> | null
  run?: () => { value: ProcessRunResult } | { deny: string }
}

// Answers every call the mod makes, in Claude Code's place, and records each command run.
function stubSession(on: StubOn, options: Options = {}) {
  const runs: Run[] = []
  const clock = mock.clock(on, { now: 1_790_000_600_000 })
  mock.env(on, { HOME: '/home/u' })
  const statusLine =
    options.statusLine === undefined
      ? { type: 'command', command: '~/.claude/statusline.sh' }
      : options.statusLine
  on('settings.read', () => ({
    value: statusLine === null ? {} : { statusLine },
  }))
  on('session.surfaces', () => ({ value: options.surfaces ?? [] }))
  on('session.usage', () => ({
    value: {
      startedAt: 1_790_000_000_000,
      context: { tokens: 66_000, window: 200_000, percent: 33 },
      rateLimits: [],
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/work/repo/src' }))
  on('session.root', () => ({ value: '/work/repo' }))
  on('session.id', () => ({ value: 'abc' }))
  on('session.version', () => ({ value: { version: '2.1.287' } }))
  on('process.run', (_$, e) => {
    runs.push(e)
    return options.run?.() ?? ran(0, STDOUT)
  })
  on('session.start', () => ({ cwd: '/work/repo' }))
  on('turn.complete', () => ({ text: '' }))
  // Stands for what Claude Code draws when the mod passes the band on
  on('ui.render', () => ({
    type: 'Text',
    props: {},
    children: ['drawn by Claude Code'],
  }))
  return { runs, clock }
}

function band(surface: RenderSurface, props: { hasSurvey?: boolean } = {}): MountTarget {
  return {
    plugin: 'statusline-anywhere',
    component: 'AbovePrompt',
    surface,
    viewport: { columns: 120, rows: 40, isFullscreen: false },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 5,
      bodyColumns: 120,
      scroll: { offset: 0, bodyRows: 5 },
      view: {},
      ...props,
    },
  }
}

const start = (surface: RenderSurface) => ({ surface, isInteractive: true, cwd: '/work/repo' })
const turnComplete = {
  turnId: 't1',
  answer: 'ok',
  durationMs: 10,
  isAborted: false,
  reason: 'answer',
} as const

test('draws the status line above the prompt in Desktop', async ($, on) => {
  const { runs } = stubSession(on)
  await $.session.start(start('desktop'))

  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ type: 'Text', text: 'Opus 5.5' })).toMatchObject({
    props: { color: '#d7875f' },
  })
  expect(await ui.find({ type: 'Text', text: 'repo' })).toMatchObject({
    props: { color: 'cyan' },
  })
  expect(await ui.find({ type: 'Text', text: 'line two' })).toBeDefined()

  expect(runs.length).toBe(1)
  expect(runs[0]?.argv).toEqual(['sh', '-c', '~/.claude/statusline.sh'])
  expect(runs[0]?.init?.cwd).toBe('/work/repo/src')
  const input = JSON.parse(runs[0]?.init?.stdin ?? '{}')
  expect(input.model).toEqual({
    id: 'claude-opus-5-5',
    display_name: 'Opus 5.5',
  })
  expect(input.transcript_path).toBe('/home/u/.claude/projects/-work-repo/abc.jsonl')
})

test('leaves the terminal alone, where Claude Code already draws the status line', async ($, on) => {
  const { runs, clock } = stubSession(on, { surfaces: ['terminal'] })
  await $.session.start(start('terminal'))
  await $.turn.complete(turnComplete)
  await clock.advance(120_000)
  expect(runs.length).toBe(0)

  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('shows why when the command cannot run', async ($, on) => {
  stubSession(on, { run: () => ({ deny: 'spawn sh ENOENT' }) })
  await $.session.start(start('desktop'))

  const ui = await $.ui.mount(band('desktop'))
  expect(
    await ui.find({
      type: 'Text',
      text: /^statusline-anywhere: .*spawn sh ENOENT/,
    }),
  ).toMatchObject({
    props: { dimColor: true },
  })
})

test('shows the exit code and error output when the command fails silently', async ($, on) => {
  stubSession(on, { run: () => ran(127, '', 'sh: statusline.sh: not found\n') })
  await $.session.start(start('desktop'))

  const ui = await $.ui.mount(band('desktop'))
  expect(
    await ui.find({
      type: 'Text',
      text: /^statusline-anywhere: exit 127: sh: statusline.sh: not found$/,
    }),
  ).toBeDefined()
})

test('draws nothing when no statusLine command is set', async ($, on) => {
  const { runs } = stubSession(on, { statusLine: null })
  await $.session.start(start('desktop'))
  expect(runs.length).toBe(0)

  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('refreshes after each reply', async ($, on) => {
  const { runs } = stubSession(on)
  await $.session.start(start('desktop'))
  await $.turn.complete(turnComplete)
  expect(runs.length).toBe(2)
})

test('refreshes every 60 seconds by default', async ($, on) => {
  const { runs, clock } = stubSession(on)
  await $.session.start(start('desktop'))
  await clock.advance(59_999)
  expect(runs.length).toBe(1)
  await clock.advance(1)
  expect(runs.length).toBe(2)
})

test('refreshes on the refreshInterval the status line sets', async ($, on) => {
  const { runs, clock } = stubSession(on, {
    statusLine: {
      type: 'command',
      command: '~/.claude/statusline.sh',
      refreshInterval: 5,
    },
  })
  await $.session.start(start('desktop'))
  await clock.advance(5_000)
  expect(runs.length).toBe(2)
})

test('indents the band by the status line padding', async ($, on) => {
  stubSession(on, {
    statusLine: {
      type: 'command',
      command: '~/.claude/statusline.sh',
      padding: 2,
    },
  })
  await $.session.start(start('desktop'))

  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ type: 'Box' })).toMatchObject({
    props: { paddingLeft: 2 },
  })
})

test('gives the band up while Claude Code shows a survey', async ($, on) => {
  stubSession(on)
  await $.session.start(start('desktop'))

  const ui = await $.ui.mount(band('desktop', { hasSurvey: true }))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})
