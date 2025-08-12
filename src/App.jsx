import React, { useMemo, useState, useEffect } from 'react'
import {
  loadState, saveState,
  addMatch, getMatchesByFilter,
  bubblyRandomPick, applyBubblyAward,
  maybeAutoReset, resetBubbly
} from './state/storage'
import { getSeasonWindow, formatDate } from './utils/date'

const PLAYERS = [
  { id:'nicky', name:'Nicky' },
  { id:'jeffy', name:'Jeffy' },
]

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

// Options
const SCORE_OPTS = ['', ...Array.from({length:10},(_,i)=>String(i+1))] // "", "1".."10"
const CTP_OPTS = [
  {v:'none', label:''},
  {v:'nicky', label:'Nicky'},
  {v:'jeffy', label:'Jeffy'},
]
const OTHER_TOKENS = ['N30','N40','N50','NOB','J30','J40','J50','JOB']

export default function App() {
  const [state, setState] = useState(loadState())
  const [view, setView] = useState('match')       // match | history | summary | bubbly
  const [filter, setFilter] = useState('current') // current | all
  const [assignTo, setAssignTo] = useState('jeffy')
  const [bubblyResult, setBubblyResult] = useState(null)

  // one player's per-round bundle (scores only now)
  const emptyPlayer = () => ({
    holes: Array(18).fill(''), // score per hole as token "", "1".."10"
  })

  // round form
  const [matchForm, setMatchForm] = useState({
    date: new Date().toISOString().slice(0,10),
    course: '',
    ctpPerHole: Array(18).fill('none'),  // 'none' | 'nicky' | 'jeffy'
    otherPerHole: Array(18).fill([]),    // string[] per hole (tokens)
    players: { nicky: emptyPlayer(), jeffy: emptyPlayer() }
  })

  // boot: seasonal check + persist
  useEffect(() => {
    const copy = structuredClone(state)
    maybeAutoReset(copy, new Date())
    saveState(copy)
    setState(copy)
  }, []) // eslint-disable-line
  useEffect(() => { saveState(state) }, [state])

  const matches = useMemo(() => getMatchesByFilter(state, filter), [state, filter])
  const seasonWindow = getSeasonWindow()

  // totals
  const totals = useMemo(() => {
    const calc = (pid) => {
      const vals = (matchForm.players[pid].holes || []).map(v => v===''?0:Number(v))
      const front = vals.slice(0,9).reduce((s,v)=>s+v,0)
      const back  = vals.slice(9).reduce((s,v)=>s+v,0)
      return { front, back, total: front+back }
    }
    return { nicky: calc('nicky'), jeffy: calc('jeffy') }
  }, [matchForm])

  // helpers for form
  function setHole(pid, idx, token) {
    setMatchForm(f => {
      const next = structuredClone(f)
      next.players[pid].holes[idx] = token // "", "1".."10"
      return next
    })
  }
  function setCTP(idx, who) {
    setMatchForm(f => {
      const next = structuredClone(f)
      next.ctpPerHole[idx] = who // 'none'|'nicky'|'jeffy'
      return next
    })
  }
  function setOtherMulti(idx, selectedOptions) {
    const values = Array.from(selectedOptions).map(o=>o.value)
    setMatchForm(f => {
      const next = structuredClone(f)
      next.otherPerHole[idx] = values
      return next
    })
  }

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
    setMatchForm(m => ({
      date: new Date().toISOString().slice(0,10),
      course: '',
      ctpPerHole: Array(18).fill('none'),
      otherPerHole: Array(18).fill([]),
      players: { nicky: emptyPlayer(), jeffy: emptyPlayer() }
    }))
  }

  // BUBBLY
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

  // tallies for notes
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

  function ScoreBlock({ title, holes }) {
    const s0 = holes[0]-1
    return (
      <div className="card" style={{overflowX:'auto'}}>
        <h4 style={{marginTop:0}}>{title}</h4>
        {/* Scores */}
        <table>
          <thead>
            <tr>
              <th style={{width:110}}>Name</th>
              {holes.map(h=><th key={h}>{h}</th>)}
              {title==='Front 9' ? <th>Front</th> : (<><th>Back</th><th>Total</th></>)}
            </tr>
          </thead>
          <tbody>
            {PLAYERS.map(p=>(
              <tr key={p.id}>
                <td style={{fontWeight:700}}>{p.name}</td>
                {holes.map((h,i)=>(
                  <td key={h}>
                    <select
                      value={matchForm.players[p.id].holes[s0+i]}
                      onChange={e=>setHole(p.id, s0+i, e.target.value)}
                      style={{width:'3.6rem'}}
                    >
                      {SCORE_OPTS.map(opt=>(
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                ))}
                {title==='Front 9'
                  ? <td><b>{p.id==='nicky'
                        ? matchForm.players.nicky.holes.slice(0,9).reduce((s,t)=>s+(t===''?0:Number(t)),0)
                        : matchForm.players.jeffy.holes.slice(0,9).reduce((s,t)=>s+(t===''?0:Number(t)),0)
                      }</b></td>
                  : <>
                      <td><b>{p.id==='nicky'
                        ? matchForm.players.nicky.holes.slice(9).reduce((s,t)=>s+(t===''?0:Number(t)),0)
                        : matchForm.players.jeffy.holes.slice(9).reduce((s,t)=>s+(t===''?0:Number(t)),0)
                      }</b></td>
                      <td><b>{p.id==='nicky'
                        ? matchForm.players.nicky.holes.reduce((s,t)=>s+(t===''?0:Number(t)),0)
                        : matchForm.players.jeffy.holes.reduce((s,t)=>s+(t===''?0:Number(t)),0)
                      }</b></td>
                    </>
                }
              </tr>
            ))}
            {/* CTP row */}
            <tr>
              <td style={{fontWeight:700}}>CTP</td>
              {holes.map((h,i)=>{
                const idx = s0+i
                const val = matchForm.ctpPerHole[idx]
                return (
                  <td key={h}>
                    <select value={val} onChange={e=>setCTP(idx, e.target.value)} style={{width:'6.6rem'}}>
                      {CTP_OPTS.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </td>
                )
              })}
              {title==='Front 9' ? <td /> : <><td /><td /></>}
            </tr>
            {/* Other row (multi-select) */}
            <tr>
              <td style={{fontWeight:700}}>Other</td>
              {holes.map((h,i)=>{
                const idx = s0+i
                const selected = matchForm.otherPerHole[idx] || []
                return (
                  <td key={h}>
                    <select
                      multiple
                      value={selected}
                      onChange={e=>setOtherMulti(idx, e.target.selectedOptions)}
                      style={{width:'6.6rem'}}
                    >
                      {OTHER_TOKENS.map(tok=>(
                        <option key={tok} value={tok}>{tok}</option>
                      ))}
                    </select>
                  </td>
                )
              })}
              {title==='Front 9' ? <td /> : <><td /><td /></>}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // Summary (season)
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
      {view==='match' && (
        <Section title="Enter Match">
          {/* meta */}
          <div className="row" style={{marginBottom:'.75rem'}}>
            <div>
              <label>Date</label>
              <input type="date" value={matchForm.date}
                     onChange={e=>setMatchForm({...matchForm, date:e.target.value})}/>
            </div>
            <div>
              <label>Course</label>
              <input value={matchForm.course}
                     onChange={e=>setMatchForm({...matchForm, course:e.target.value})}
                     placeholder="Course name"/>
            </div>
          </div>

          {/* Front & Back blocks */}
          <ScoreBlock title="Front 9" holes={FRONT} />
          <ScoreBlock title="Back 9"  holes={BACK} />

          <button className="btn" onClick={commitMatch}>Save Match</button>
        </Section>
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
    </div>
  )
}
