// Turns one line of status line output (text with ANSI escape codes) into styled segments that map
// onto a mod's `Text` props.
//
// Colours: the 8 basic colours keep their names, which Desktop paints. Every other colour becomes a
// hex string, because Desktop ignores the `ansi256(...)` form.

export type Segment = {
  text: string
  color?: string
  backgroundColor?: string
  bold?: true
  dimColor?: true
  italic?: true
  underline?: true
  inverse?: true
  strikethrough?: true
}

type Style = Omit<Segment, 'text'>

const BASIC = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
// xterm's default values for the 8 bright colours (indexes 8-15)
const BRIGHT = [
  '#7f7f7f',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#5c5cff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
]
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255]

// OSC (ESC ] ... BEL or ESC \), CSI (ESC [ params final), or any other two-byte escape
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching escape sequences is this regex's job
const ESCAPE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[([0-9;:]*)([@-~])|\x1b[@-_]/g

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`
}

function colourAt(index: number): string | undefined {
  if (index < 0 || index > 255) return undefined
  if (index < 8) return BASIC[index]
  if (index < 16) return BRIGHT[index - 8]
  if (index < 232) {
    const n = index - 16
    const level = (step: number) => CUBE_LEVELS[step] ?? 0
    return hex(level(Math.floor(n / 36)), level(Math.floor(n / 6) % 6), level(n % 6))
  }
  const grey = 8 + (index - 232) * 10
  return hex(grey, grey, grey)
}

// Reads an extended colour (38/48 followed by 5;n or 2;r;g;b) starting at codes[i]. Returns the colour
// and how many codes it used.
function extendedColour(codes: number[], i: number): [string | undefined, number] {
  if (codes[i + 1] === 5) return [colourAt(codes[i + 2] ?? -1), 3]
  if (codes[i + 1] === 2) return [hex(codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0), 5]
  return [undefined, 1]
}

function applySgr(style: Style, params: string): Style {
  const codes = params === '' ? [0] : params.split(/[;:]/).map((p) => (p === '' ? 0 : Number(p)))
  let next: Style = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i] ?? 0
    if (code === 0) next = {}
    else if (code === 1) next.bold = true
    else if (code === 2) next.dimColor = true
    else if (code === 3) next.italic = true
    else if (code === 4) next.underline = true
    else if (code === 7) next.inverse = true
    else if (code === 9) next.strikethrough = true
    else if (code === 22) {
      delete next.bold
      delete next.dimColor
    } else if (code === 23) delete next.italic
    else if (code === 24) delete next.underline
    else if (code === 27) delete next.inverse
    else if (code === 29) delete next.strikethrough
    else if (code >= 30 && code <= 37) next.color = BASIC[code - 30]
    else if (code >= 90 && code <= 97) next.color = BRIGHT[code - 90]
    else if (code === 39) delete next.color
    else if (code >= 40 && code <= 47) next.backgroundColor = BASIC[code - 40]
    else if (code >= 100 && code <= 107) next.backgroundColor = BRIGHT[code - 100]
    else if (code === 49) delete next.backgroundColor
    else if (code === 38 || code === 48) {
      const [colour, used] = extendedColour(codes, i)
      if (colour !== undefined) {
        if (code === 38) next.color = colour
        else next.backgroundColor = colour
      }
      i += used - 1
    }
  }
  return next
}

function sameStyle(a: Style, b: Style): boolean {
  // Segments carry their text alongside the style; compare only the style
  const keys = new Set(
    [...Object.keys(a), ...Object.keys(b)].filter((key) => key !== 'text'),
  ) as Set<keyof Style>
  for (const key of keys) if (a[key] !== b[key]) return false
  return true
}

export function parseAnsiLine(line: string): Segment[] {
  const segments: Segment[] = []
  let style: Style = {}
  let last = 0

  const push = (text: string) => {
    if (text === '') return
    const previous = segments[segments.length - 1]
    if (previous && sameStyle(previous, style)) previous.text += text
    else segments.push({ text, ...style })
  }

  for (const match of line.matchAll(ESCAPE)) {
    push(line.slice(last, match.index))
    if (match[2] === 'm') style = applySgr(style, match[1] ?? '')
    last = (match.index ?? 0) + match[0].length
  }
  push(line.slice(last))
  return segments
}
