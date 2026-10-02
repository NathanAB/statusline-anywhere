# statusline-anywhere

Claude Code draws your custom status line in the terminal, but not in the Claude Desktop app.
statusline-anywhere fixes that. It runs the `statusLine` command you already have and draws its
output, in colour, in the band above the prompt.

- **Your status line, unchanged.** It reads `statusLine.command` from your settings, so any status
  line works, including ones from [statuslin.es](https://statuslin.es).
- **Desktop only.** In a terminal, Claude Code already draws your status line, so this plugin
  neither runs the command nor draws anything there.
- **Kept current.** It reruns the command when the session starts, after each reply, and on a
  timer: your `refreshInterval` if you set one, otherwise every 60 seconds.

Made by [statuslin.es](https://statuslin.es), the gallery of Claude Code status lines.

## Install

In Claude Code (Desktop's Code tab or the terminal):

```
/plugin marketplace add NathanAB/statusline-anywhere
/plugin install statusline-anywhere@statusline-anywhere
```

Then start a new session, or run `/reload-plugins`.

You need a status line configured first. See
[Customize your status line](https://code.claude.com/docs/en/statusline), or pick one from
[statuslin.es](https://statuslin.es).

## What your script receives

Claude Code sends status line scripts a JSON object on stdin. A plugin can't see everything Claude
Code can, so statusline-anywhere sends these fields:

- `session_id`
- `transcript_path`
- `cwd`
- `model` (`id`, `display_name`)
- `workspace` (`current_dir`, `project_dir`)
- `version`
- `cost` (`total_cost_usd`, `total_duration_ms`)
- `context_window` (`total_input_tokens`, `context_window_size`, `used_percentage`,
  `remaining_percentage`)
- `exceeds_200k_tokens`
- `rate_limits` (`five_hour`, `seven_day`, `spend_limit`)

Fields it has no source for are left out, the same way Claude Code leaves out a field it has no
value for: lines changed, PR, vim mode, prompt cache, effort and output style. A script that reads
them should handle their absence, as it already must.

## Limits

- **macOS and Linux only for now.** The command runs through `sh`.
- **No clickable links.** OSC 8 links show as plain text.
- **It runs your command, as you.** That is exactly what Claude Code does with your `statusLine`,
  and the plugin runs nothing else. Its full footprint, as `claude plugin validate` reports it:
  `$.settings.read`, `$.session.*` reads, `$.env.get` (`HOME`, `CLAUDE_CONFIG_DIR`),
  `$.process.run`, `$.clock` and drawing.

## Develop

statusline-anywhere is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview).
Use Claude Code 2.1.286 or later.

```bash
claude plugin validate .
claude plugin test
```

To try a change in a session: `claude --plugin-dir .`.

To type-check, load the plugin once with `--plugin-dir`. Claude Code then writes its types to
`.claude-plugin/types/`. Then run `npx tsc -p .claude-plugin/types/tsconfig.json`.

## License

MIT
