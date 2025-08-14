import React, { useMemo, useState, useEffect } from 'react'
import {
  loadState, saveState,
  addMatch, getMatchesByFilter,
  bubblyRandomPick, applyBubblyAward,
  maybeAutoReset
} from './state/storage'
import { getSeasonWindow, formatDate } from './utils/date'

// --- UI helpers ---
function Section({ title, children, right }) {
  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.5rem'}}>
        <h3 style={{margin:0}}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

const range = (a,b)=>Array.from({length:b-a+1},(_,i)=>a+i)
const FRONT = range(1,9)
const BACK  = range(10,18)

const CTP_OPTS = [
  {v:'none',  label:''},
  {v:'nicky', label:'Nicky'},
  {v:'jeffy', label:'Jeffy'},
]
const OTHER_TOKENS = ['N30','N40','N50','NOB','J30','J40','J50','JOB']

// --- score control: +/- with readout (no dropdown) ---
function ScorePicker({ value, onChange }) {
  // value is "", "1".."10"
  const toNum = (t) => (t === '' ? 0 : Number(t));
  const toTok = (n) => (n <= 0 ? '' : String(Math.min(10, n)));
  const dec = () => onChange(toTok(toNum(value) - 1));
  const inc = () => onChange(toTok(toNum(value) + 1));
  const display = value === '' ? '—' : value;
  return (
    <div className="scorepicker">
      <button type="button" className="chip" onClick={dec} aria-label="decrease">−</button>
      <div className="score-readout" aria-live="polite">{display}</div>
      <button type="button" className="chip" onClick={inc} aria-label="increase">+</button>
    </div>
  );
}

// --- full-screen sheet for Other tokens ---
function OtherPickerSheet({ open, initial, onClose, onSave }) {
  if (!open) return null;
  const [sel, setSel] = React.useState(new Set(initial || []));
  const toggle = (tok) => {
    const next = new Set(sel);
    next.has(tok) ? next.delete(tok) : next.add(tok);
    setSel(next);
  };
  return (
    <div className="sheet">
      <div className="sheet-card">
        <div className="sheet-header">
          <h3 style={{margin:0}}>Other</h3>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
        <div className="chip-grid">
          {OTHER_TOKENS.map(tok => (
            <button
              key={tok}
              type="button"
              className={`chip-toggle${sel.has(tok) ? ' active' : ''}`}
              onClick={()=>toggle(tok)}
            >
              {tok}
            </button>
          ))}
        </div>
        <div className="sheet-actions">
          <button className="btn" onClick={()=>onSave(Array.from(sel))}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // --- state ---
  const [state, setState] = useState(loadState())
  const [view, setView] = useState('match')       // match | history | summary | bubbly
  const [filter, setFilter] = useState('current') // current | all
  const [assignTo, setAssignTo] = useState('jeffy')
  const [bubblyResult, setBubblyResult] = useState(null)
  const [openOther, setOpenOther] = useState(null); // { idx, values } | null

  const emptyPlayer = () => ({ holes: Array(18).fill('') }) // score tokens "", "1".."10"

  const [matchForm, setMatchForm] = useState({
    date: new Date().toISOString().slice(0,10),
    course: '',
    ctpPerHole: Array(18).fill('none'),  // 'none' | 'nicky' | 'jeffy'
    otherPerHole: Array(18).fill([]),    // string[] per hole (tokens)
    players: { nicky: emptyPlayer(), jeffy: emptyPlayer() }
  })

  // --- boot/reset + persist ---
  useEffect(() => {
    const copy = structuredClone(state)
    maybeAutoReset(copy, new Date())
    saveState(copy)
    setState(copy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { saveState(state) }, [state])

  const matches = useMemo(() => getMatchesByFilter(state, filter), [state, filter])
  const seasonWindow = getSeasonWindow()

  // --- computed totals for current form ---
  const totals = useMemo(() => {
    const calc = (pid) => {
      const vals = (matchForm.players[pid].holes || []).map(v => v===''?0:Number(v))
      const front = vals.slice(0,9).reduce((s,v)=>s+v,0)
      const back  = vals.slice(9).reduce((s,v)=>s+v,0)
      return { front, back, total: front+back }
    }
    return { nicky: calc('nicky'), jeffy: calc('jeffy') }
  }, [matchForm])

  // --- form setters ---
  function setHole(pid, idx, token) {
    setMatchForm(f => {
      const next = structuredClone(f)
      next.players[pid].holes[idx] = token
      return next
    })
  }
  function setCTP(idx, who) {
    setMatchForm(f => {
      const next = structuredClone(f)
      next.ctpPerHole[idx] = who
      return next
    })
  }
  // old multi-select handler (kept for compatibility in history, etc.)
  function setOtherMulti(idx, selectedOptions) {
    const values = Array.from(selectedOptions).map(o=>o.value)
    setMatchForm(f => {
      const next = structuredClone(f)
      next.otherPerHole[idx] = values
      return next
    })
  }
  // new direct array saver for Other sheet
  function setOtherValues(idx, valuesArr) {
    setMatchForm(f => {
      const next = structuredClone(f)
      next.otherPerHole[idx] = Array.isArray(valuesArr) ? valuesArr : []
      return next
    })
  }

  // --- commit match ---
  function commitMatch() {
    const payload = {
      date: matchForm.date,
      course: matchForm.course || '',
      ctpPerHole: [...matchForm.ctpPerHole],
      otherPerHole: matchForm.otherPerHole.map(arr => Array.isArray(arr)?arr:[]),
      players: [
        {
          id:'nicky',
          holes: matchForm.players.nicky.holes.map(t=>t===''?0:Number(t)),
          score: totals.nicky.total
        },
        {
          id:'jeffy',
          holes: matchForm.players.jeffy.holes.map(t=>t===''?0:Number(t)),
          score: totals.jeffy.total
        }
      ]
    }
    const copy = structuredClone(state)
    addMatch(copy, payload)
    saveState(copy)
    setState(copy)
    alert('Match saved.')
    setMatchForm({
      date: new Date().toISOString().slice(0,10),
      course: '',
      ctpPerHole: Array(18).fill('none'),
      otherPerHole: Array(18).fill([]),
      players: { nicky: emptyPlayer(), jeffy: emptyPlayer() }
    })
  }

  // --- BUBBLY ---
  function doBubbly() {
    const copy = structuredClone(state)
    const item = bubblyRandomPick(copy)
    if (!item) { alert('BUBBLY pool is empty.'); return }
    applyBubblyAward(copy, item, assignTo)
    saveState(copy)
    setState(copy)
    setBubblyResult(item)
  }
  function undoLastBubbly() {
    const copy = structuredClone(state)
    const last = copy.bubbly.history.pop()
    if (!last) { alert('No BUBBLY to undo.'); return }
    // return item to pool
    const poolItem = copy.bubbly.pool.find(p => p.label === last.itemLabel)
    if (poolItem) poolItem.qty = (poolItem.qty || 0) + 1
    // reverse tallies
    const t = copy.bubbly.tallies[last.winnerId]
    if (t) {
      if (last.type === 'points') {
        t.points -= (last.delta || 0)
      } else {
        t.items[last.itemLabel] = Math.max(0, (t.items[last.itemLabel] || 0) - 1)
        if (t.items[last.itemLabel] === 0) delete t.items[last.itemLabel]
      }
    }
    saveState(copy)
    setState(copy)
    setBubblyResult(null)
  }

  // --- history helpers ---
  function countCtp(ctp) {
    let n=0, j=0
    for (const w of ctp||[]) { if (w==='nicky') n++; else if (w==='jeffy') j++; }
    return { n, j }
  }
  function countOtherTokens(otherPerHole) {
    const tallies = {N30:0,N40:0,N50:0,NOB:0,J30:0,J40:0,J50:0,JOB:0}
    for (const arr of otherPerHole||[]) {
      if (!Array.isArray(arr)) continue
      for (const t of arr) if (t in tallies) tallies[t]++
    }
    return tallies
  }

  // --- summary memo ---
  const seasonSummary = useMemo(() => {
    const totals = { jeffy:{wins:0, played:0, scoreSum:0}, nicky:{wins:0, played:0, scoreSum:0} }
    matches.forEach(m => {
      const pj = m.players.find(p=>p.id==='jeffy')
      const pn = m.players.find(p=>p.id==='nicky')
      if (!pj || !pn) return
      totals.jeffy.played++; totals.nicky.played++
      totals.jeffy.scoreSum += Number(pj.score)||0
      totals.nicky.scoreSum += Number(pn.score)||0
      if ((Number(pj.score)||0) < (Number(pn.score)||0)) totals.jeffy.wins++
      else if ((Number(pn.score)||0) < (Number(pj.score)||0)) totals.nicky.wins++
    })
    return totals
  }, [matches])

  // --- vertical score block (no horizontal scroll) ---
  function ScoreBlock({ title, holes }) {
    const s0 = holes[0] - 1;
    const TotalStrip = ({ which }) => (
      <div className="totals-row">
        <div className="totals-title">{title === 'Front 9' ? 'Front totals' : 'Back & overall'}</div>
        <div className="totals-cells">
          <div>
            <div className="muted">Nicky</div>
            <b>
              {which === 'front'
                ? matchForm.players.nicky.holes.slice(0, 9).reduce((s, t) => s + (t === '' ? 0 : Number(t)), 0)
                : matchForm.players.nicky.holes.slice(9).reduce((s, t) => s + (t === '' ? 0 : Number(t)), 0)}
            </b>
            {which === 'back' && (
              <div className="muted small">
                Total: <b>{matchForm.players.nicky.holes.reduce((s,t)=>s+(t===''?0:Number(t)),0)}</b>
              </div>
            )}
          </div>
          <div>
            <div className="muted">Jeffy</div>
            <b>
              {which === 'front'
                ? matchForm.players.jeffy.holes.slice(0, 9).reduce((s, t) => s + (t === '' ? 0 : Number(t)), 0)
                : matchForm.players.jeffy.holes.slice(9).reduce((s, t) => s + (t === '' ? 0 : Number(t)), 0)}
            </b>
            {which === 'back' && (
              <div className="muted small">
                Total: <b>{matchForm.players.jeffy.holes.reduce((s,t)=>s+(t===''?0:Number(t)),0)}</b>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    return (
      <div className="card">
        <h4 style={{marginTop:0}}>{title}</h4>

        {/* sticky subheader */}
        <div className="vhead vrow sticky-subhead">
          <div>Hole</div>
          <div>Nicky</div>
          <div>Jeffy</div>
          <div>CTP</div>
          <div>Other</div>
        </div>

        {/* rows */}
        {holes.map((h, i) => {
          const idx = s0 + i;
          const ctpVal = matchForm.ctpPerHole[idx];
          const otherVals = matchForm.otherPerHole[idx] || [];
          return (
            <div className="vrow" key={h}>
              <div className="holecell">{h}</div>

              {/* Nicky score */}
              <div>
                <ScorePicker
                  value={matchForm.players.nicky.holes[idx]}
                  onChange={(tok)=>setHole('nicky', idx, tok)}
                />
              </div>

              {/* Jeffy score */}
              <div>
                <ScorePicker
                  value={matchForm.players.jeffy.holes[idx]}
                  onChange={(tok)=>setHole('jeffy', idx, tok)}
                />
              </div>

              {/* CTP */}
              <div>
                <select value={ctpVal} onChange={(e)=>setCTP(idx, e.target.value)}>
                  {CTP_OPTS.map((o) => (
                    <option key={o.v} value={o.v}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Other (opens sheet) */}
              <div>
                <button
                  type="button"
                  className="btn other-btn"
                  onClick={()=>setOpenOther({ idx, values: otherVals })}
                >
                  {otherVals.length ? `Other • ${otherVals.length}` : 'Other'}
                </button>
              </div>
            </div>
          );
        })}

        {/* totals */}
        <TotalStrip which={title === 'Front 9' ? 'front' : 'back'} />
      </div>
    );
  }

  // --- export / import local backup ---
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `disc-golf-data-${new Date().toISOString().slice(0,10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  function importDataFile(file) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        if (!parsed || typeof parsed !== 'object' || !('matches' in parsed) || !('bubbly' in parsed)) {
          alert('That file does not look like Disc Golf data.')
          return
        }
        saveState(parsed)
        setState(loadState())
        alert('Data imported successfully.')
      } catch (e) {
        console.error(e)
        alert('Could not read that file.')
      }
    }
    reader.readAsText(file)
  }

  // --- RENDER ---
  return (
    <div className="app">
      <header>
        <h2>Disc Golf — Jeffy vs Nicky</h2>
        <div className="muted">Season: {seasonWindow.start.toLocaleDateString()}–{seasonWindow.end.toLocaleDateString()}</div>
      </header>

      <nav>
        <button onClick={()=>setView('match')}>Match Entry</button>
        <button onClick={()=>setView('history')}>History</button>
        <button onClick={()=>setView('summary')}>Summary</button>
        <button onClick={()=>setView('bubbly')}>BUBBLY</button>
        <span className="pill">Local only</span>
      </nav>

      {/* MATCH ENTRY */}
      {view === 'match' && (
        <>
          <Section title="Enter Match">
            {/* meta */}
            <div className="row" style={{marginBottom:'.75rem'}}>
              <div>
                <label>Date</label>
                <input
                  type="date"
                  value={matchForm.date}
                  onChange={e=>setMatchForm({...matchForm, date:e.target.value})}
                />
              </div>
              <div>
                <label>Course</label>
                <input
                  value={matchForm.course}
                  onChange={e=>setMatchForm({...matchForm, course:e.target.value})}
                  placeholder="Course name"
                />
              </div>
            </div>

            {/* Front & Back blocks */}
            <ScoreBlock title="Front 9" holes={FRONT} />
            <ScoreBlock title="Back 9"  holes={BACK} />

            {/* Inline save (hidden on phones via CSS .save-inline) */}
            <button className="btn save-inline" onClick={commitMatch}>Save Match</button>
          </Section>

          {/* Floating save button on mobile */}
          <div className="fab">
            <button className="btn" onClick={commitMatch}>Save Match</button>
          </div>
        </>
      )}

      {/* HISTORY */}
      {view==='history' && (
        <Section
          title="Match History"
          right={
            <select value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="current">Current Season</option>
              <option value="all">All Time</option>
            </select>
          }
        >
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Course</th>
                <th>Jeffy Total</th><th>Nicky Total</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => {
                const pj = m.players.find(p=>p.id==='jeffy') || {}
                const pn = m.players.find(p=>p.id==='nicky') || {}
                const { n:ctpN, j:ctpJ } = countCtp(m.ctpPerHole || [])
                const tok = countOtherTokens(m.otherPerHole || [])
                const notes = [
                  ctpJ?`J-CTP:${ctpJ}`:'', ctpN?`N-CTP:${ctpN}`:'',
                  tok.N30?`N30:${tok.N30}`:'', tok.N40?`N40:${tok.N40}`:'', tok.N50?`N50:${tok.N50}`:'', tok.NOB?`NOB:${tok.NOB}`:'',
                  tok.J30?`J30:${tok.J30}`:'', tok.J40?`J40:${tok.J40}`:'', tok.J50?`J50:${tok.J50}`:'', tok.JOB?`JOB:${tok.JOB}`:''
                ].filter(Boolean).join(' · ')
                return (
                  <tr key={m.id}>
                    <td>{formatDate(m.date)}</td>
                    <td>{m.course}</td>
                    <td>{pj.score}</td>
                    <td>{pn.score}</td>
                    <td className="muted">{notes}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* SUMMARY */}
      {view==='summary' && (
        <Section title="Summary">
          <div className="row">
            <div className="card">
              <h4>Jeffy</h4>
              <div>Wins: <b>{seasonSummary.jeffy.wins}</b></div>
              <div>Matches: <b>{seasonSummary.jeffy.played}</b></div>
              <div>Avg Score: <b>{seasonSummary.jeffy.played ? (seasonSummary.jeffy.scoreSum/seasonSummary.jeffy.played).toFixed(1) : '-'}</b></div>
              <div className="muted">BUBBLY points: <b>{state.bubbly.tallies.jeffy.points}</b></div>
              <div className="muted">Items: {Object.entries(state.bubbly.tallies.jeffy.items||{}).map(([k,v])=>`${k}×${v}`).join(', ') || '-'}</div>
            </div>
            <div className="card">
              <h4>Nicky</h4>
              <div>Wins: <b>{seasonSummary.nicky.wins}</b></div>
              <div>Matches: <b>{seasonSummary.nicky.played}</b></div>
              <div>Avg Score: <b>{seasonSummary.nicky.played ? (seasonSummary.nicky.scoreSum/seasonSummary.nicky.played).toFixed(1) : '-'}</b></div>
              <div className="muted">BUBBLY points: <b>{state.bubbly.tallies.nicky.points}</b></div>
              <div className="muted">Items: {Object.entries(state.bubbly.tallies.nicky.items||{}).map(([k,v])=>`${k}×${v}`).join(', ') || '-'}</div>
            </div>
          </div>

          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:8}}>
            <button className="btn" onClick={exportData}>Export data</button>
            <label className="btn" style={{cursor:'pointer'}}>
              Import data
              <input
                type="file"
                accept="application/json"
                style={{display:'none'}}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) importDataFile(file)
                  e.target.value = '' // reset for next time
                }}
              />
            </label>
          </div>

          <div className="muted">BUBBLY pool remaining: {state.bubbly.pool.reduce((s,i)=>s+i.qty,0)}</div>
        </Section>
      )}

      {/* BUBBLY */}
      {view==='bubbly' && (
        <Section
          title="BUBBLY"
          right={
            <select value={assignTo} onChange={e=>setAssignTo(e.target.value)}>
              <option value="jeffy">Jeffy</option>
              <option value="nicky">Nicky</option>
            </select>
          }
        >
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button className="btn" onClick={doBubbly}>BUBBLY</button>
            <button className="btn secondary" onClick={undoLastBubbly}>Undo previous BUBBLY</button>
          </div>

          {bubblyResult && (
            <div style={{marginTop:'.75rem'}}>
              <div>Selected: <b>{bubblyResult.label}</b> ({bubblyResult.type}{bubblyResult.delta?`, delta ${bubblyResult.delta}`:''})</div>
              <div className="muted">Assigned to: {assignTo}</div>
            </div>
          )}

          <div style={{marginTop:'1rem'}} className="muted">
            Remaining items in pool: {state.bubbly.pool.reduce((s,i)=>s+i.qty,0)}
          </div>
          <details style={{marginTop:'.5rem'}}>
            <summary>View recent BUBBLY history</summary>
            <ul>
              {[...state.bubbly.history].slice(-15).reverse().map((h,i)=>(
                <li key={i}>
                  {new Date(h.timestamp).toLocaleString()} — {h.winnerId} got <b>{h.itemLabel}</b> {h.type==='points'?`(${h.delta>0?'+':''}${h.delta})`:''}
                </li>
              ))}
            </ul>
          </details>
        </Section>
      )}

      {/* Render the full-screen "Other" picker sheet once, at root level */}
      <OtherPickerSheet
        open={!!openOther}
        initial={openOther?.values || []}
        onClose={()=>setOpenOther(null)}
        onSave={(vals)=>{
          if (openOther) {
            const { idx } = openOther;
            setOtherValues(idx, vals); // saves array of tokens
          }
          setOpenOther(null);
        }}
      />
    </div>
  )
}
