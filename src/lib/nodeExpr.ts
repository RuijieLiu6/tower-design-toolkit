// Formula language for community nodes (tower-studio-node@1). A small recursive-descent parser over a fixed set of
// variables and functions: no eval, no property access, no loops, no strings. Comparisons and logic return 1 or 0.
// A copy for agents lives in skills/tower-studio-node-builder/scripts/check_node.mjs; nodePackages.test.ts keeps them equal.

export type Ast =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'un'; op: '-' | '+' | '!'; a: Ast }
  | { k: 'bin'; op: string; a: Ast; b: Ast }
  | { k: 'if'; c: Ast; a: Ast; b: Ast }
  | { k: 'call'; fn: string; args: Ast[] }

export class ExprError extends Error {
  constructor(message: string, readonly at: number) { super(message) }
}

export const MAX_LENGTH = 500
const MAX_DEPTH = 40

const deg = Math.PI / 180
/** name → [min args, max args, implementation] */
export const FUNCTIONS: Record<string, [number, number, (...x: number[]) => number]> = {
  min: [1, 20, (...x) => Math.min(...x)],
  max: [1, 20, (...x) => Math.max(...x)],
  abs: [1, 1, Math.abs],
  sqrt: [1, 1, Math.sqrt],
  pow: [2, 2, Math.pow],
  round: [1, 2, (x, n = 0) => { const f = 10 ** Math.round(n); return Math.round(x * f) / f }],
  floor: [1, 1, Math.floor],
  ceil: [1, 1, Math.ceil],
  clamp: [3, 3, (x, lo, hi) => Math.min(hi, Math.max(lo, x))],
  log: [1, 1, Math.log],
  log10: [1, 1, Math.log10],
  exp: [1, 1, Math.exp],
  sin: [1, 1, Math.sin],
  cos: [1, 1, Math.cos],
  tan: [1, 1, Math.tan],
  asin: [1, 1, Math.asin],
  acos: [1, 1, Math.acos],
  atan: [1, 1, Math.atan],
  atan2: [2, 2, Math.atan2],
  rad: [1, 1, (x) => x * deg],
  deg: [1, 1, (x) => x / deg],
  if: [3, 3, (c, a, b) => (c ? a : b)],
  finite: [1, 1, (x) => (Number.isFinite(x) ? 1 : 0)],
}
/** NA = not available on purpose, e.g. `tower.gfa_office > 0 ? … : NA` skips towers with no office. */
export const CONSTANTS: Record<string, number> = { PI: Math.PI, NA: NaN }

type Tok = { t: 'num'; v: number; at: number } | { t: 'name'; v: string; at: number } | { t: 'op'; v: string; at: number }
const OPS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '^', '<', '>', '!', '?', ':', '(', ')', ',']

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))
      if (!m) throw new ExprError(`“${c}” is not a number`, i)
      out.push({ t: 'num', v: Number(m[0]), at: i }); i += m[0].length; continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i))!
      out.push({ t: 'name', v: m[0], at: i }); i += m[0].length; continue
    }
    const op = OPS.find((o) => src.startsWith(o, i))
    if (!op) throw new ExprError(`“${c}” can't be used in a formula`, i)
    out.push({ t: 'op', v: op, at: i }); i += op.length
  }
  return out
}

/** Parse a formula. Throws ExprError with a plain-words message and the character position. */
export function parse(src: string): Ast {
  if (src.length > MAX_LENGTH) throw new ExprError(`The formula is ${src.length} characters long; the limit is ${MAX_LENGTH}`, MAX_LENGTH)
  const toks = tokenize(src)
  let p = 0, depth = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v
  const where = () => (peek() ? peek().at : src.length)
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(peek() ? `Expected “${v}” but found “${String(peek().v)}”` : `Expected “${v}” but the formula ended`, where())
    p++
  }
  const enter = () => { if (++depth > MAX_DEPTH) throw new ExprError('The formula is nested too deeply', where()) }

  const binary = (next: () => Ast, ops: string[]) => (): Ast => {
    let a = next()
    while (peek()?.t === 'op' && ops.includes(peek().v as string)) { const op = toks[p++].v as string; a = { k: 'bin', op, a, b: next() } }
    return a
  }
  const expr = (): Ast => { enter(); const r = ternary(); depth--; return r }
  const ternary = (): Ast => {
    const c = or()
    if (!isOp('?')) return c
    p++
    const a = expr(); expect(':'); const b = expr()
    return { k: 'if', c, a, b }
  }
  const unary = (): Ast => {
    if (isOp('-') || isOp('+') || isOp('!')) { const op = toks[p++].v as '-' | '+' | '!'; enter(); const a = unary(); depth--; return { k: 'un', op, a } }
    return power()
  }
  const power = (): Ast => {
    const a = atom()
    if (!isOp('^')) return a
    p++
    enter(); const b = unary(); depth--
    return { k: 'bin', op: '^', a, b }
  }
  const mult = binary(unary, ['*', '/', '%'])
  const add = binary(mult, ['+', '-'])
  const cmp = binary(add, ['<', '<=', '>', '>='])
  const eq = binary(cmp, ['==', '!='])
  const and = binary(eq, ['&&'])
  const or = binary(and, ['||'])
  const atom = (): Ast => {
    const tk = peek()
    if (!tk) throw new ExprError('The formula ended early', src.length)
    if (tk.t === 'num') { p++; return { k: 'num', v: tk.v } }
    if (tk.t === 'name') {
      p++
      if (isOp('(')) {
        const spec = Object.hasOwn(FUNCTIONS, tk.v) ? FUNCTIONS[tk.v] : undefined
        if (!spec) throw new ExprError(`“${tk.v}” is not a function Tower Design Toolkit knows${suggestText(tk.v, Object.keys(FUNCTIONS))}`, tk.at)
        p++
        const args: Ast[] = []
        if (!isOp(')')) { do { args.push(expr()) } while (isOp(',') && ++p) }
        expect(')')
        if (args.length < spec[0] || args.length > spec[1]) {
          const want = spec[0] === spec[1] ? `${spec[0]}` : spec[1] >= 20 ? `at least ${spec[0]}` : `${spec[0]} or ${spec[1]}`
          throw new ExprError(`“${tk.v}” takes ${want} value${want === '1' ? '' : 's'}, not ${args.length}`, tk.at)
        }
        return { k: 'call', fn: tk.v, args }
      }
      if (Object.hasOwn(FUNCTIONS, tk.v) && !tk.v.includes('.')) throw new ExprError(`“${tk.v}” is a function: write ${tk.v}(…)`, tk.at)
      return { k: 'var', name: tk.v }
    }
    if (tk.v === '(') { p++; const e = expr(); expect(')'); return e }
    throw new ExprError(`Unexpected “${tk.v}”`, tk.at)
  }

  if (!toks.length) throw new ExprError('The formula is empty', 0)
  const ast = expr()
  if (p < toks.length) throw new ExprError(`Unexpected “${String(toks[p].v)}” after the end of the formula`, toks[p].at)
  return ast
}

/** Variable names a formula reads (constants excluded). */
export function variablesOf(ast: Ast, out = new Set<string>()): Set<string> {
  switch (ast.k) {
    case 'var': if (!Object.hasOwn(CONSTANTS, ast.name)) out.add(ast.name); break
    case 'un': variablesOf(ast.a, out); break
    case 'bin': variablesOf(ast.a, out); variablesOf(ast.b, out); break
    case 'if': variablesOf(ast.c, out); variablesOf(ast.a, out); variablesOf(ast.b, out); break
    case 'call': ast.args.forEach((x) => variablesOf(x, out)); break
  }
  return out
}

/** Evaluate. Missing or null inputs are NaN, so the result is NaN and the node says it can't compute. */
export function evaluate(ast: Ast, vars: Record<string, number | null | undefined>): number {
  switch (ast.k) {
    case 'num': return ast.v
    case 'var': {
      if (Object.hasOwn(CONSTANTS, ast.name)) return CONSTANTS[ast.name]
      const v = Object.hasOwn(vars, ast.name) ? vars[ast.name] : undefined
      return typeof v === 'number' ? v : NaN
    }
    case 'un': {
      const a = evaluate(ast.a, vars)
      return ast.op === '-' ? -a : ast.op === '+' ? a : a ? 0 : 1
    }
    case 'if': return evaluate(ast.c, vars) ? evaluate(ast.a, vars) : evaluate(ast.b, vars)
    case 'call': return FUNCTIONS[ast.fn][2](...ast.args.map((x) => evaluate(x, vars)))
    case 'bin': {
      if (ast.op === '&&') return evaluate(ast.a, vars) && evaluate(ast.b, vars) ? 1 : 0
      if (ast.op === '||') return evaluate(ast.a, vars) || evaluate(ast.b, vars) ? 1 : 0
      const a = evaluate(ast.a, vars), b = evaluate(ast.b, vars)
      switch (ast.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '%': return a % b
        case '^': return a ** b
        case '<': return a < b ? 1 : 0
        case '<=': return a <= b ? 1 : 0
        case '>': return a > b ? 1 : 0
        case '>=': return a >= b ? 1 : 0
        case '==': return a === b ? 1 : 0
        case '!=': return a !== b ? 1 : 0
      }
    }
  }
  return NaN
}

/** Closest known name, for "did you mean" hints (edit distance ≤ 3). */
export function suggest(name: string, known: string[]): string | null {
  let best: string | null = null, bestD = 4
  for (const k of known) {
    const d = editDistance(name.toLowerCase(), k.toLowerCase())
    if (d < bestD) { bestD = d; best = k }
  }
  return best
}
const suggestText = (name: string, known: string[]) => { const s = suggest(name, known); return s ? `. Did you mean “${s}”?` : '' }

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}
