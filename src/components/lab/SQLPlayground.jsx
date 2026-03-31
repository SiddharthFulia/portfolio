import { useState, useCallback, useRef } from 'react'

// ─── Database ────────────────────────────────────────────────────────────────

const DB = {
  employees: [
    { id: 1,  name: 'Alice Johnson',   department: 'Engineering', salary: 95000, age: 30, city: 'San Francisco' },
    { id: 2,  name: 'Bob Smith',       department: 'Marketing',   salary: 72000, age: 35, city: 'New York' },
    { id: 3,  name: 'Carol White',     department: 'Engineering', salary: 110000, age: 28, city: 'Seattle' },
    { id: 4,  name: 'David Lee',       department: 'HR',          salary: 65000, age: 42, city: 'Chicago' },
    { id: 5,  name: 'Emma Davis',      department: 'Engineering', salary: 120000, age: 32, city: 'San Francisco' },
    { id: 6,  name: 'Frank Miller',    department: 'Finance',     salary: 88000, age: 38, city: 'Boston' },
    { id: 7,  name: 'Grace Wilson',    department: 'Marketing',   salary: 76000, age: 27, city: 'Austin' },
    { id: 8,  name: 'Henry Brown',     department: 'Engineering', salary: 105000, age: 45, city: 'Seattle' },
    { id: 9,  name: 'Iris Chen',       department: 'Finance',     salary: 92000, age: 33, city: 'New York' },
    { id: 10, name: 'James Taylor',    department: 'HR',          salary: 61000, age: 29, city: 'Chicago' },
    { id: 11, name: 'Karen Martinez',  department: 'Marketing',   salary: 83000, age: 36, city: 'Los Angeles' },
    { id: 12, name: 'Liam Anderson',   department: 'Engineering', salary: 98000, age: 31, city: 'San Francisco' },
  ],
  departments: [
    { id: 1, name: 'Engineering', budget: 5000000, location: 'San Francisco' },
    { id: 2, name: 'Marketing',   budget: 2000000, location: 'New York' },
    { id: 3, name: 'HR',          budget: 1000000, location: 'Chicago' },
    { id: 4, name: 'Finance',     budget: 3000000, location: 'Boston' },
    { id: 5, name: 'Sales',       budget: 1500000, location: 'Austin' },
  ],
  projects: [
    { id: 1, name: 'Apollo API',        employee_id: 1,  status: 'Active',    deadline: '2026-06-30' },
    { id: 2, name: 'Brand Refresh',     employee_id: 2,  status: 'Active',    deadline: '2026-03-15' },
    { id: 3, name: 'Cloud Migration',   employee_id: 3,  status: 'Completed', deadline: '2025-12-01' },
    { id: 4, name: 'Data Pipeline',     employee_id: 5,  status: 'Active',    deadline: '2026-07-20' },
    { id: 5, name: 'ERP Upgrade',       employee_id: 6,  status: 'On Hold',   deadline: '2026-09-01' },
    { id: 6, name: 'Mobile App',        employee_id: 8,  status: 'Active',    deadline: '2026-05-14' },
    { id: 7, name: 'SEO Campaign',      employee_id: 7,  status: 'Completed', deadline: '2025-11-30' },
    { id: 8, name: 'Security Audit',    employee_id: 12, status: 'Active',    deadline: '2026-04-10' },
  ],
}

const SCHEMA = {
  employees:   ['id', 'name', 'department', 'salary', 'age', 'city'],
  departments: ['id', 'name', 'budget', 'location'],
  projects:    ['id', 'name', 'employee_id', 'status', 'deadline'],
}

// ─── SQL Engine ──────────────────────────────────────────────────────────────

function tokenize(sql) {
  const tokens = []
  let i = 0
  const s = sql.trim()
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue }
    if (s[i] === "'") {
      let j = i + 1
      while (j < s.length && s[j] !== "'") j++
      tokens.push({ type: 'STRING', val: s.slice(i + 1, j) })
      i = j + 1; continue
    }
    if (/\d/.test(s[i]) || (s[i] === '-' && /\d/.test(s[i + 1]))) {
      let j = i
      if (s[j] === '-') j++
      while (j < s.length && /[\d.]/.test(s[j])) j++
      tokens.push({ type: 'NUMBER', val: parseFloat(s.slice(i, j)) })
      i = j; continue
    }
    if (/[<>!=]/.test(s[i])) {
      let op = s[i]
      if (s[i + 1] === '=' || (s[i] === '<' && s[i + 1] === '>')) { op += s[i + 1]; i++ }
      tokens.push({ type: 'OP', val: op }); i++; continue
    }
    if (s[i] === ',') { tokens.push({ type: 'COMMA', val: ',' }); i++; continue }
    if (s[i] === '(') { tokens.push({ type: 'LPAREN', val: '(' }); i++; continue }
    if (s[i] === ')') { tokens.push({ type: 'RPAREN', val: ')' }); i++; continue }
    if (s[i] === '*') { tokens.push({ type: 'STAR', val: '*' }); i++; continue }
    if (s[i] === '.') { tokens.push({ type: 'DOT', val: '.' }); i++; continue }
    if (/[a-zA-Z_]/.test(s[i])) {
      let j = i
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++
      const word = s.slice(i, j)
      const kw = word.toUpperCase()
      const keywords = ['SELECT', 'FROM', 'WHERE', 'ORDER', 'BY', 'LIMIT', 'JOIN',
        'INNER', 'ON', 'AND', 'OR', 'NOT', 'ASC', 'DESC', 'GROUP', 'LIKE',
        'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'AS', 'DISTINCT']
      tokens.push({ type: keywords.includes(kw) ? 'KW' : 'IDENT', val: keywords.includes(kw) ? kw : word })
      i = j; continue
    }
    i++
  }
  return tokens
}

function parseSQL(sql) {
  const tokens = tokenize(sql)
  let pos = 0
  const peek = () => tokens[pos]
  const consume = (type, val) => {
    const t = tokens[pos]
    if (!t) throw new Error(`Unexpected end of input, expected ${val || type}`)
    if (type && t.type !== type) throw new Error(`Expected ${type} but got ${t.type} ('${t.val}')`)
    if (val && t.val !== val) throw new Error(`Expected '${val}' but got '${t.val}'`)
    pos++
    return t
  }
  const tryConsume = (type, val) => {
    const t = tokens[pos]
    if (!t) return null
    if (type && t.type !== type) return null
    if (val && t.val !== val) return null
    pos++
    return t
  }

  consume('KW', 'SELECT')

  // DISTINCT
  let distinct = false
  if (peek()?.val === 'DISTINCT') { consume('KW', 'DISTINCT'); distinct = true }

  // Columns / aggregates
  const columns = []
  const parseExpr = () => {
    const t = tokens[pos]
    // aggregate COUNT(*)
    if (t?.type === 'KW' && ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(t.val)) {
      const fn = consume('KW').val
      consume('LPAREN')
      let arg
      if (peek()?.type === 'STAR') { consume('STAR'); arg = '*' }
      else arg = consume('IDENT').val
      consume('RPAREN')
      let alias = fn + '(' + arg + ')'
      if (peek()?.val === 'AS') { consume('KW'); alias = consume('IDENT').val }
      return { type: 'aggregate', fn, arg, alias }
    }
    // qualified col table.col
    if (t?.type === 'IDENT' && tokens[pos + 1]?.type === 'DOT') {
      const tbl = consume('IDENT').val
      consume('DOT')
      const col = consume('IDENT').val
      let alias = `${tbl}.${col}`
      if (peek()?.val === 'AS') { consume('KW'); alias = consume('IDENT').val }
      return { type: 'col', table: tbl, col, alias }
    }
    if (t?.type === 'STAR') { consume('STAR'); return { type: 'star' } }
    if (t?.type === 'IDENT') {
      const col = consume('IDENT').val
      let alias = col
      if (peek()?.val === 'AS') { consume('KW'); alias = consume('IDENT').val }
      return { type: 'col', col, alias }
    }
    throw new Error(`Unexpected token in SELECT: '${t?.val}'`)
  }

  columns.push(parseExpr())
  while (tryConsume('COMMA')) columns.push(parseExpr())

  consume('KW', 'FROM')
  const table1 = consume('IDENT').val

  // JOIN
  let joinTable = null, joinCond = null
  if (peek()?.val === 'INNER' || peek()?.val === 'JOIN') {
    tryConsume('KW', 'INNER')
    consume('KW', 'JOIN')
    joinTable = consume('IDENT').val
    consume('KW', 'ON')
    const leftParts = [consume('IDENT').val]
    if (peek()?.type === 'DOT') { consume('DOT'); leftParts.push(consume('IDENT').val) }
    consume('OP', '=')
    const rightParts = [consume('IDENT').val]
    if (peek()?.type === 'DOT') { consume('DOT'); rightParts.push(consume('IDENT').val) }
    joinCond = { left: leftParts, right: rightParts }
  }

  // WHERE
  let whereClause = null
  if (peek()?.val === 'WHERE') {
    consume('KW', 'WHERE')
    whereClause = parseCondition()
  }

  // GROUP BY
  let groupBy = null
  if (peek()?.val === 'GROUP') {
    consume('KW', 'GROUP'); consume('KW', 'BY')
    groupBy = consume('IDENT').val
  }

  // ORDER BY
  let orderBy = null
  if (peek()?.val === 'ORDER') {
    consume('KW', 'ORDER'); consume('KW', 'BY')
    const col = consume('IDENT').val
    const dir = tryConsume('KW', 'ASC') ? 'ASC' : tryConsume('KW', 'DESC') ? 'DESC' : 'ASC'
    orderBy = { col, dir }
  }

  // LIMIT
  let limit = null
  if (peek()?.val === 'LIMIT') {
    consume('KW', 'LIMIT')
    limit = consume('NUMBER').val
  }

  function parseCondition() {
    let left = parseSingleCond()
    while (peek()?.val === 'AND' || peek()?.val === 'OR') {
      const op = consume('KW').val
      const right = parseSingleCond()
      left = { type: 'logic', op, left, right }
    }
    return left
  }

  function parseSingleCond() {
    if (peek()?.val === 'NOT') {
      consume('KW', 'NOT')
      const cond = parseSingleCond()
      return { type: 'not', cond }
    }
    if (peek()?.type === 'LPAREN') {
      consume('LPAREN')
      const c = parseCondition()
      consume('RPAREN')
      return c
    }
    // col or table.col
    let col
    if (tokens[pos + 1]?.type === 'DOT') {
      consume('IDENT'); consume('DOT')
      col = consume('IDENT').val
    } else {
      col = consume('IDENT').val
    }
    const op = consume('OP').val
    let val
    if (peek()?.type === 'STRING') val = consume('STRING').val
    else if (peek()?.type === 'NUMBER') val = consume('NUMBER').val
    else val = consume('IDENT').val
    return { type: 'cmp', col, op, val }
  }

  return { columns, table: table1, joinTable, joinCond, whereClause, groupBy, orderBy, limit, distinct }
}

function evalCond(cond, row) {
  if (!cond) return true
  if (cond.type === 'logic') {
    if (cond.op === 'AND') return evalCond(cond.left, row) && evalCond(cond.right, row)
    if (cond.op === 'OR') return evalCond(cond.left, row) || evalCond(cond.right, row)
  }
  if (cond.type === 'not') return !evalCond(cond.cond, row)
  if (cond.type === 'cmp') {
    const rowVal = row[cond.col]
    const condVal = cond.val
    const r = typeof rowVal === 'number' ? rowVal : String(rowVal ?? '').toLowerCase()
    const c = typeof condVal === 'number' ? condVal : String(condVal ?? '').toLowerCase()
    switch (cond.op) {
      case '=':  return r == c
      case '!=': case '<>': return r != c
      case '>':  return r > c
      case '<':  return r < c
      case '>=': return r >= c
      case '<=': return r <= c
      case 'LIKE': {
        const pattern = String(condVal).replace(/%/g, '.*').replace(/_/g, '.')
        return new RegExp('^' + pattern + '$', 'i').test(String(rowVal ?? ''))
      }
      default: return false
    }
  }
  return true
}

function runQuery(sql) {
  const ast = parseSQL(sql.trim())
  let rows = [...(DB[ast.table] || [])]
  if (!DB[ast.table]) throw new Error(`Unknown table: ${ast.table}`)

  // JOIN
  if (ast.joinTable) {
    if (!DB[ast.joinTable]) throw new Error(`Unknown table: ${ast.joinTable}`)
    const joinRows = DB[ast.joinTable]
    const [lTbl, lCol] = ast.joinCond.left.length === 2 ? ast.joinCond.left : [ast.table, ast.joinCond.left[0]]
    const [rTbl, rCol] = ast.joinCond.right.length === 2 ? ast.joinCond.right : [ast.joinTable, ast.joinCond.right[0]]
    const merged = []
    for (const r1 of rows) {
      for (const r2 of joinRows) {
        const leftVal = lTbl === ast.table ? r1[lCol] : r2[lCol]
        const rightVal = rTbl === ast.joinTable ? r2[rCol] : r1[rCol]
        if (leftVal == rightVal) {
          const combined = {}
          Object.entries(r1).forEach(([k, v]) => { combined[`${ast.table}.${k}`] = v; combined[k] = v })
          Object.entries(r2).forEach(([k, v]) => { combined[`${ast.joinTable}.${k}`] = v; if (!(k in combined)) combined[k] = v })
          merged.push(combined)
        }
      }
    }
    rows = merged
  }

  // WHERE
  if (ast.whereClause) rows = rows.filter(r => evalCond(ast.whereClause, r))

  // GROUP BY + aggregates
  const hasAgg = ast.columns.some(c => c.type === 'aggregate')
  if (hasAgg || ast.groupBy) {
    const groups = {}
    const groupKey = ast.groupBy
    for (const row of rows) {
      const key = groupKey ? String(row[groupKey]) : '__all__'
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    }
    rows = Object.entries(groups).map(([key, groupRows]) => {
      const result = {}
      if (groupKey) result[groupKey] = groupRows[0][groupKey]
      for (const col of ast.columns) {
        if (col.type === 'aggregate') {
          const vals = col.arg === '*' ? groupRows.map(() => 1) : groupRows.map(r => r[col.arg]).filter(v => v != null)
          const nums = vals.map(Number)
          if (col.fn === 'COUNT') result[col.alias] = groupRows.length
          else if (col.fn === 'SUM')   result[col.alias] = nums.reduce((a, b) => a + b, 0)
          else if (col.fn === 'AVG')   result[col.alias] = nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0
          else if (col.fn === 'MIN')   result[col.alias] = Math.min(...nums)
          else if (col.fn === 'MAX')   result[col.alias] = Math.max(...nums)
        } else if (col.type === 'col') {
          result[col.alias] = groupRows[0][col.col]
        }
      }
      return result
    })
  }

  // SELECT columns
  let projected
  if (ast.columns[0]?.type === 'star') {
    projected = rows
  } else {
    projected = rows.map(row => {
      const out = {}
      for (const col of ast.columns) {
        if (col.type === 'col') {
          const key = col.col
          const src = col.table ? row[`${col.table}.${key}`] ?? row[key] : row[key]
          out[col.alias] = src
        } else if (col.type === 'aggregate') {
          out[col.alias] = row[col.alias]
        }
      }
      return out
    })
  }

  // DISTINCT
  if (ast.distinct) {
    const seen = new Set()
    projected = projected.filter(row => {
      const key = JSON.stringify(row)
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  }

  // ORDER BY
  if (ast.orderBy) {
    const { col, dir } = ast.orderBy
    projected.sort((a, b) => {
      if (a[col] < b[col]) return dir === 'ASC' ? -1 : 1
      if (a[col] > b[col]) return dir === 'ASC' ? 1 : -1
      return 0
    })
  }

  // LIMIT
  if (ast.limit != null) projected = projected.slice(0, ast.limit)

  return projected
}

// ─── Examples ────────────────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'Select all employees', sql: 'SELECT * FROM employees' },
  { label: 'High-salary engineers', sql: "SELECT name, salary FROM employees WHERE department = 'Engineering' AND salary > 100000 ORDER BY salary DESC" },
  { label: 'JOIN employees & projects', sql: 'SELECT employees.name, projects.name, projects.status FROM employees INNER JOIN projects ON employees.id = projects.employee_id' },
  { label: 'Avg salary by department', sql: 'SELECT department, AVG(salary) AS avg_salary, COUNT(*) AS headcount FROM employees GROUP BY department ORDER BY avg_salary DESC' },
  { label: 'LIKE name search', sql: "SELECT * FROM employees WHERE name LIKE '%a%'" },
  { label: 'Top 5 highest paid', sql: 'SELECT name, salary, city FROM employees ORDER BY salary DESC LIMIT 5' },
  { label: 'Active projects', sql: "SELECT * FROM projects WHERE status = 'Active' ORDER BY deadline ASC" },
  { label: 'Department budgets', sql: 'SELECT name, budget, location FROM departments ORDER BY budget DESC' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function SQLPlayground() {
  const [sql, setSql] = useState(EXAMPLES[0].sql)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [time, setTime] = useState(null)
  const [schemaOpen, setSchemaOpen] = useState(true)
  const textareaRef = useRef(null)

  const execute = useCallback(() => {
    if (!sql.trim()) return
    const t0 = performance.now()
    try {
      const rows = runQuery(sql)
      setResults(rows)
      setError(null)
      setTime((performance.now() - t0).toFixed(2))
    } catch (e) {
      setError(e.message)
      setResults(null)
      setTime(null)
    }
  }, [sql])

  const onKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); execute() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const newVal = sql.substring(0, start) + '  ' + sql.substring(end)
      setSql(newVal)
      requestAnimationFrame(() => { if (textareaRef.current) { textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2 } })
    }
  }

  const columns = results?.length ? Object.keys(results[0]) : []

  return (
    <div className="bg-gray-900 rounded-xl p-5 text-white">
      <div className="flex gap-4">
        {schemaOpen && (
          <div className="w-44 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 font-mono uppercase tracking-wide">Schema</span>
              <button onClick={() => setSchemaOpen(false)} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
            </div>
            {Object.entries(SCHEMA).map(([tbl, cols]) => (
              <div key={tbl} className="mb-3">
                <div className="text-cyan-400 font-mono text-xs font-bold mb-1">{tbl}</div>
                {cols.map(c => (
                  <div key={c} className="text-gray-500 font-mono text-xs pl-2 py-0.5">{c}</div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 mb-3 items-center">
            {!schemaOpen && (
              <button onClick={() => setSchemaOpen(true)} className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded font-mono">Schema</button>
            )}
            <select
              onChange={e => { const ex = EXAMPLES.find(x => x.label === e.target.value); if (ex) setSql(ex.sql) }}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-cyan-600 font-mono"
              defaultValue="">
              <option value="" disabled>Examples…</option>
              {EXAMPLES.map(ex => <option key={ex.label} value={ex.label}>{ex.label}</option>)}
            </select>
            <button onClick={execute}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-semibold transition-colors ml-auto">
              Run
            </button>
            <span className="text-gray-600 text-xs font-mono">Ctrl+Enter</span>
          </div>

          <textarea
            ref={textareaRef}
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={onKeyDown}
            rows={5}
            spellCheck={false}
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 font-mono text-sm text-cyan-200 focus:outline-none focus:border-cyan-600 resize-y placeholder-gray-700"
            placeholder="SELECT * FROM employees"
          />

          {error && (
            <div className="mt-3 p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-400 font-mono text-sm">
              Error: {error}
            </div>
          )}

          {results && (
            <div className="mt-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-gray-500 text-xs font-mono">{results.length} row{results.length !== 1 ? 's' : ''}</span>
                {time && <span className="text-gray-600 text-xs font-mono">{time}ms</span>}
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="bg-gray-800">
                      {columns.map(c => (
                        <th key={c} className="px-4 py-2 text-left text-cyan-400 font-semibold text-xs uppercase tracking-wide border-b border-gray-700">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900/50'}>
                        {columns.map(c => (
                          <td key={c} className="px-4 py-2 text-gray-300 border-b border-gray-800/50 whitespace-nowrap">
                            {row[c] === null || row[c] === undefined ? <span className="text-gray-600">NULL</span> : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {results.length === 0 && (
                      <tr><td colSpan={columns.length || 1} className="px-4 py-6 text-center text-gray-600">No rows returned</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
