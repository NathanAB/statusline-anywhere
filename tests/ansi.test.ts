import { expect, test } from 'claude-code/testing'
import { parseAnsiLine } from '../hooks/ansi'

const ESC = '\x1b'

test('plain text is one unstyled segment', () => {
  expect(parseAnsiLine('hello')).toEqual([{ text: 'hello' }])
})

test('the 8 basic colours keep their names, which Desktop paints', () => {
  expect(parseAnsiLine(`${ESC}[31mred${ESC}[0m plain`)).toEqual([
    { text: 'red', color: 'red' },
    { text: ' plain' },
  ])
  expect(parseAnsiLine(`${ESC}[46mbg`)).toEqual([{ text: 'bg', backgroundColor: 'cyan' }])
})

test('256-colour indexes become hex, because Desktop ignores ansi256(...)', () => {
  // 173 is in the 6x6x6 cube: (215, 135, 95)
  expect(parseAnsiLine(`${ESC}[38;5;173mopus`)).toEqual([{ text: 'opus', color: '#d7875f' }])
  // 240 is on the grey ramp: 8 + 8 * 10 = 88
  expect(parseAnsiLine(`${ESC}[48;5;240mgrey`)).toEqual([
    { text: 'grey', backgroundColor: '#585858' },
  ])
  // 0-7 are the basic colours
  expect(parseAnsiLine(`${ESC}[38;5;2mgreen`)).toEqual([{ text: 'green', color: 'green' }])
})

test('bright colours become hex', () => {
  expect(parseAnsiLine(`${ESC}[91mhot`)).toEqual([{ text: 'hot', color: '#ff0000' }])
  expect(parseAnsiLine(`${ESC}[38;5;12mblue`)).toEqual([{ text: 'blue', color: '#5c5cff' }])
  expect(parseAnsiLine(`${ESC}[103mwarn`)).toEqual([{ text: 'warn', backgroundColor: '#ffff00' }])
})

test('24-bit colours become hex', () => {
  expect(parseAnsiLine(`${ESC}[38;2;255;128;0mx${ESC}[48;2;0;0;0my`)).toEqual([
    { text: 'x', color: '#ff8000' },
    { text: 'y', color: '#ff8000', backgroundColor: '#000000' },
  ])
})

test('text attributes turn on and off', () => {
  expect(parseAnsiLine(`${ESC}[1;3mbi${ESC}[22mi${ESC}[23;4mu${ESC}[24m.`)).toEqual([
    { text: 'bi', bold: true, italic: true },
    { text: 'i', italic: true },
    { text: 'u', underline: true },
    { text: '.' },
  ])
  expect(
    parseAnsiLine(`${ESC}[2mdim${ESC}[22m ${ESC}[7minv${ESC}[27m ${ESC}[9mx${ESC}[29m`),
  ).toEqual([
    { text: 'dim', dimColor: true },
    { text: ' ' },
    { text: 'inv', inverse: true },
    { text: ' ' },
    { text: 'x', strikethrough: true },
  ])
})

test('39 and 49 reset only the colour they name', () => {
  expect(parseAnsiLine(`${ESC}[1;31;44ma${ESC}[39mb${ESC}[49mc`)).toEqual([
    { text: 'a', bold: true, color: 'red', backgroundColor: 'blue' },
    { text: 'b', bold: true, backgroundColor: 'blue' },
    { text: 'c', bold: true },
  ])
})

test('an empty SGR resets everything', () => {
  expect(parseAnsiLine(`${ESC}[1;32mok${ESC}[m done`)).toEqual([
    { text: 'ok', bold: true, color: 'green' },
    { text: ' done' },
  ])
})

test('OSC 8 links and other escape sequences are dropped, their text kept', () => {
  const link = `${ESC}]8;;https://example.com${ESC}\\PR #12${ESC}]8;;${ESC}\\`
  expect(parseAnsiLine(`see ${link}!`)).toEqual([{ text: 'see PR #12!' }])
  const belLink = `${ESC}]8;;https://example.com\x07docs${ESC}]8;;\x07`
  expect(parseAnsiLine(belLink)).toEqual([{ text: 'docs' }])
  expect(parseAnsiLine(`${ESC}[2Kclear${ESC}[1Gstart`)).toEqual([{ text: 'clearstart' }])
})
