import React, { useMemo, useState, useEffect } from 'react'
import {
  loadState, saveState,
  addMatch, getMatchesByFilter,
  bubblyRandomPick, applyBubblyAward,
  wipeAll, maybeAutoReset, resetBubbly
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

export default function App() {
  const [state, setState] = useState(loadState())
  const [view, setView] = useState('match')       // match | history | summary | bubbly | settings
  const [filter, setFilter] = useState('current') // current | all
  const [assignTo, setAssignTo] = useState('jeffy')
  const [bubblyResult, setBubblyResult] = useState(null)

  // one player's per-round bundle (scores only now)
  const emptyPlayer = () => ({
    holes: Array(18).fill(''), // score per hole
  })

  // round form
  const [matchForm, setMatchForm] = useState({
    date: new Date().toISOString().slice(0,10),
    course: '',
    // shared rows:
    ctpPerHole: Array(18).fill('none'),    // 'none' | 'nicky' | 'jeffy'
    otherPerHole: Array(18).fill(''),      // free text like "OB", "50", "OB+40"
    // players:
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
      const vals = (matchForm.players[pid].holes || []).map(v => Number(v)||0)
      const front = vals.slice(0,9).reduce((s,v)=>s+v,0)
      const back  = vals.slice(9).reduce((s,v)=>s+v,0)
      return { front, back, total: front+back }
    }
    return { nicky: calc('nicky'), jeffy: calc('jeffy') }
  }, [matchForm])

  // helpers
  function setHole(pid, idx, val) {
    const v = val === '' ? '' : Math.max(0, Number(val))
    setMatchForm(f => {
      const next = structuredClone(f)
      next.players[pid].holes[idx] = v
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
  function setOther(idx, text) {
    setMatchForm(f => {
      const next = structuredClone(f)
      next.otherPerHole[idx] = text
      return next
    })
  }

  function commitMatch() {
    const payload = {
      date: matchForm.date,
      course: matchForm.course || '',
      ctpPerHole: [...matchForm.ctpPerHole],
      otherPerHole: [...matchForm.otherPerHole],
      players: [
        {
          id:'nicky',
          holes: matchForm.players.nicky.holes.map(n=>Number(n)||0),
          score: totals.nicky.total
        },
        {
          id:'jeffy',
          holes: matchForm.players.jeffy.holes.map(n=>Number(n)||0),
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
      otherPerHole: Array(18).fill(''),
      players: { nicky: emptyPlayer(), jeffy: emptyPlayer() }
    }))
  }

  function doBubbly() {
    const copy = structuredClone(state)
    const item = bubblyRandomPick(copy)
    if (!item) { alert('BUBBLY pool is empty.'); return }
    applyBubblyAward(copy, item, assignTo)
    saveState(copy)
    setState(copy)
    setBubblyResult(item)
  }
  function manualResetBubbly() {
    if (!confirm('Reset BUBBLY pool and tallies? This will archive current tallies into the season history.')) return
    const copy = structuredClone(state)
    const yr = new Date().getFullYear()
    copy.bubbly.historyArchive = copy.bubbly.historyArchive || []
    copy.bubbly.historyArchive.push({
      season: `${yr-1}-${yr}`,
      tallies: JSON.parse(JSON.stringify(copy.bubbly.tallies)),
      history: JSON.parse(JSON.stringify(copy.bubbly.history))
    })
    resetBubbly(copy)
    saveState(copy)
    setState(copy)
  }

  // derive CTP totals for history notes
  function countCtp(ctp) {
    let n=0, j=0
    for (const w of ctp||[]) { if (w==='nicky') n++; else if (w==='jeffy') j++; }
    return { n, j }
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
                    <input
                      type="number"
                      inputMode="numeric"
                      value={matchForm.players[p.id].holes[s0+i]}
                      onChange={e=>setHole(p.id, s0+i, e.target.value)}
                      style={{width:'3.2rem'}}
                    />
                  </td>
                ))}
                {title==='Front 9'
                  ? <td><b>{p.id==='nicky'?totals.nicky.front:totals.jeffy.front}</b></td>
                  : <>
                      <td><b>{p.id==='nicky'?totals.nicky.back:totals.jeffy.back}</b></td>
                      <td><b>{p.id==='nicky'?totals.nicky.total:totals.jeffy.total}</b></td>
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
                    <select value={val} onChange={e=>setCTP(idx, e.target.value)} style={{width:'3.4rem'}}>
                      <option value="none"></option>
                      <option value="nicky">N</option>
                      <option value="jeffy">J</option>
                    </select>
                  </td>
                )
              })}
              {title==='Front 9' ? <td /> : <><td /><td /></>}
            </tr>
            {/* Other row */}
            <tr>
              <td style={{fontWeight:700}}>Other</td>
              {holes.map((h,i)=>{
                const idx = s0+i
                return (
                  <td key={h}>
                    <input
                      value={matchForm.otherPerHole[idx]}
                      onChange={e=>setOther(idx, e.target.value)}
                      placeholder=""
                      style={{width:'3.2rem'}}
                    />
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
        <button onClick={()=>setView('settings')}>Settings</button>
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
                const notes = [
                  ctpJ?`J-CTP:${ctpJ}`:'', ctpN?`N-CTP:${ctpN}`:'',
                  (m.otherPerHole||[]).some(Boolean) ? `Other:${(m.otherPerHole||[]).join('|')}` : ''
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
          <button className="btn" onClick={doBubbly}>BUBBLY</button>
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

      {/* SETTINGS */}
      {view==='settings' && (
        <Section title="Settings">
          <div className="row">
            <div className="card">
              <h4>Data</h4>
              <button className="btn secondary" onClick={manualResetBubbly}>Reset BUBBLY now</button>
              <div style={{height:8}} />
              <button
                className="btn secondary"
                onClick={()=>{
                  if (confirm('Wipe all data?')) {
                    const copy = structuredClone(state)
                    wipeAll(copy)
                    saveState(copy)
                    setState(copy)
                  }
                }}
              >
                Wipe all data
              </button>
            </div>
            <div className="card">
              <h4>About</h4>
              <div className="muted">Installable PWA. Data is stored locally on this device.</div>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}
