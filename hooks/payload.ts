// Builds the JSON a status line script reads on stdin, from what the mods API can see. Claude Code
// documents the full shape at https://code.claude.com/docs/en/statusline#available-data. Fields
// the mods API has no source for (lines changed, PR, vim mode, prompt cache, ...) are left out, as
// Claude Code itself does when it has no value.

import type { SessionUsage } from 'claude-code'

export type SessionFacts = {
  sessionId: string
  root: string
  cwd: string
  model: string
  version: string
  configDir: string
  now: number
  usage: SessionUsage
}

// claude-<family>-<major>-<minor>, optionally with a date stamp and a [1m]-style suffix
const MODEL_ID = /^claude-([a-z]+)-(\d+)-(\d+)(?:-\d{8})?(?:\[[^\]]*\])?$/

export function modelDisplayName(id: string): string {
  const match = MODEL_ID.exec(id)
  if (!match) return id
  const [, family = '', major, minor] = match
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
}

// Claude Code keeps each session's transcript under the config dir, in a folder named after the
// project root with every non-alphanumeric character replaced by a dash.
export function transcriptPath(where: { configDir: string; root: string; sessionId: string }) {
  return `${where.configDir}/projects/${where.root.replace(/[^A-Za-z0-9]/g, '-')}/${where.sessionId}.jsonl`
}

function epochSeconds(iso: string | undefined): number | undefined {
  const ms = Date.parse(iso ?? '')
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined
}

function rateLimits(limits: SessionUsage['rateLimits']) {
  return Object.fromEntries(
    limits.map((limit) => {
      const resetsAt = epochSeconds(limit.resetsAt)
      const window =
        resetsAt === undefined
          ? { used_percentage: limit.percentUsed }
          : { used_percentage: limit.percentUsed, resets_at: resetsAt }
      return [limit.kind, window]
    }),
  )
}

export function buildStatusInput(facts: SessionFacts) {
  const { context, cost, startedAt } = facts.usage
  const tokens = context.tokens ?? 0
  const percent = context.percent ?? null
  return {
    session_id: facts.sessionId,
    transcript_path: transcriptPath(facts),
    cwd: facts.cwd,
    model: { id: facts.model, display_name: modelDisplayName(facts.model) },
    workspace: { current_dir: facts.cwd, project_dir: facts.root, added_dirs: [] },
    version: facts.version,
    cost: { total_cost_usd: cost?.usd ?? 0, total_duration_ms: facts.now - startedAt },
    context_window: {
      total_input_tokens: tokens,
      context_window_size: context.window,
      used_percentage: percent,
      remaining_percentage: percent === null ? null : 100 - percent,
    },
    exceeds_200k_tokens: tokens > 200_000,
    rate_limits: rateLimits(facts.usage.rateLimits),
  }
}
