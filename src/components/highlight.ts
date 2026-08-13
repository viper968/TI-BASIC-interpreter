import { COMMANDS } from '../interpreter'

/**
 * A lightweight, display-only tokenizer for the editor's syntax-highlight
 * overlay. It intentionally does NOT reuse the interpreter's lexer: this
 * only needs to look right and must reproduce the source text exactly
 * (character for character, including whitespace), which is much simpler
 * as an independent regex scan than by round-tripping through the real
 * token stream (whose tokens normalize aliases like "sqrt(" to "√(").
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const KEYWORDS = Array.from(new Set(COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])])))
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|')

const MASTER_RE = new RegExp(
  [
    '(?<str>"[^"\\n]*"?)',
    `(?<kw>${KEYWORDS})`,
    '(?<num>(?:\\d+\\.?\\d*|\\.\\d+)(?:E-?\\d+)?)',
    '(?<arrow>→|->)',
    '(?<var>θ|π|L[1-6]|\\[[A-J]\\]|Str[0-9]|Ans|[A-Z])',
    '(?<op>≤|<=|≥|>=|≠|!=|[+\\-*/^=<>(){}[\\],:!²⁻¹])',
  ].join('|'),
  'g',
)

export interface HighlightSpan {
  text: string
  cls: string | null
}

export function highlight(source: string): HighlightSpan[] {
  const spans: HighlightSpan[] = []
  let lastIndex = 0
  MASTER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MASTER_RE.exec(source))) {
    if (m.index > lastIndex) spans.push({ text: source.slice(lastIndex, m.index), cls: null })
    const groups = m.groups!
    const cls = groups.str ? 'tok-str' : groups.kw ? 'tok-kw' : groups.num ? 'tok-num' : groups.arrow ? 'tok-arrow' : groups.var ? 'tok-var' : 'tok-op'
    spans.push({ text: m[0], cls })
    lastIndex = m.index + m[0].length
    if (m[0].length === 0) MASTER_RE.lastIndex++
  }
  if (lastIndex < source.length) spans.push({ text: source.slice(lastIndex), cls: null })
  return spans
}
