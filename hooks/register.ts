// statusline-anywhere: shows your Claude Code status line where Claude Code doesn't draw it, such as
// the Claude Desktop app. It runs the `statusLine` command from your settings with the same kind of
// JSON input Claude Code sends, and draws the output in the band above the prompt.
//
// In a terminal, Claude Code already draws the status line, so this mod neither runs the command
// nor draws there.

import type { EngineInterface, On, RenderSurface, Settings } from 'claude-code'
import { parseAnsiLine, type Segment } from './ansi'
import { buildStatusInput } from './payload'

// Claude Code reruns a status line on events this mod can't see, so a timer stands in for them
const DEFAULT_REFRESH_MS = 60_000
const RUN_TIMEOUT_MS = 10_000
const PREFIX = 'statusline-anywhere: '

type StatusLine = { command: string; padding: number; refreshMs: number }

let lines: Segment[][] = []
let failure: string | null = null
let padding = 0
let running = false

function readStatusLine(settings: Settings): StatusLine | null {
  const value = settings.statusLine
  if (typeof value !== 'object' || value === null) return null
  const { command, padding, refreshInterval } = value as Record<string, unknown>
  if (typeof command !== 'string' || command.trim() === '') return null
  return {
    command,
    padding: typeof padding === 'number' && padding > 0 ? padding : 0,
    refreshMs:
      typeof refreshInterval === 'number' && refreshInterval >= 1
        ? refreshInterval * 1000
        : DEFAULT_REFRESH_MS,
  }
}

// Empty means no app has attached yet. Desktop attaches after session start, so only a session
// that is known to be terminal-only is skipped.
function isTerminalOnly(surfaces: readonly RenderSurface[]): boolean {
  return surfaces.length > 0 && surfaces.every((surface) => surface === 'terminal')
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function configDir($: EngineInterface): Promise<string> {
  const custom = await $.env.get('CLAUDE_CONFIG_DIR')
  if (custom) return custom
  return `${(await $.env.get('HOME')) ?? ''}/.claude`
}

async function runStatusLine($: EngineInterface, statusLine: StatusLine) {
  const cwd = await $.session.cwd()
  const input = buildStatusInput({
    sessionId: await $.session.id(),
    root: await $.session.root(),
    cwd,
    model: await $.session.model(),
    version: (await $.session.version()).version,
    configDir: await configDir($),
    now: await $.clock.now(),
    usage: await $.session.usage(),
  })
  return $.process.run(['sh', '-c', statusLine.command], {
    cwd,
    stdin: JSON.stringify(input),
    timeoutMs: RUN_TIMEOUT_MS,
  })
}

async function refresh($: EngineInterface) {
  if (running || isTerminalOnly(await $.session.surfaces())) return
  const statusLine = readStatusLine(await $.settings.read())
  running = true
  try {
    if (statusLine === null) {
      lines = []
      failure = null
      return
    }
    padding = statusLine.padding
    const result = await runStatusLine($, statusLine)
    const output = result.stdout.split('\n').filter((line) => line.trim() !== '')
    if (output.length === 0 && result.exitCode !== 0) {
      const stderr = result.stderr.trim()
      failure = `${PREFIX}exit ${result.exitCode}${stderr ? `: ${stderr}` : ''}`
      lines = []
    } else {
      failure = null
      lines = output.map(parseAnsiLine)
    }
  } catch (error) {
    failure = PREFIX + describeError(error)
    lines = []
  } finally {
    running = false
    $.ui.invalidate('ui.render')
  }
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const statusLine = readStatusLine(await $.settings.read())
    if (statusLine !== null) {
      await refresh($)
      $.clock.every(statusLine.refreshMs, () => refresh($))
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.hasSurvey) return next(e)
    if (failure === null && lines.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const rows =
      failure !== null
        ? [Text({ dimColor: true, children: [failure] })]
        : lines.map((segments, index) =>
            Box({
              key: `line-${index}`,
              flexDirection: 'row',
              children: segments.map(({ text, ...style }) => Text({ ...style, children: [text] })),
            }),
          )
    return Box({ flexDirection: 'column', paddingLeft: padding, children: rows })
  })
}
