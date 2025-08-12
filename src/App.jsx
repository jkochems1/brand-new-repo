import React, { useMemo, useState, useEffect } from 'react'
import {
  loadState, saveState,
  addMatch, getMatchesByFilter,
  bubblyRandomPick, applyBubblyAward,
  wipeAll, maybeAutoReset, resetBubbly
} from './state/storage'
import { getSeasonWindow, formatDate } from './utils/date'

const PLAYERS = [
  { id:'jeffy', name:'Jeffy' },
  { id:'nicky', name:'Nicky' },
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

// helpers
const range = (a,b)=>Array.from({length:b-a+1},(_,i)=>a+i)
const FRONT = range(1,9)
const BACK  = range(10,18)

export default function App() {
  const [state, setState] = useState(loadState())
  const [view, setView] = useState('match')     // match | history | summary | bubbly | settings
  const [filter, setFilter] = useState('current') // current | all
  const [assignTo, setAssignTo] = useState('jeffy')
  const [bubblyResult, setBubblyResult] = useState(null)

  // scorecard form state
  const emptyPlayer = () => ({
    holes: Array(18).fill(''),
    ctp:false, putt30:false, putt40:false, putt50:false,
    longPuttDistance:'', ob:0
  })

  const [matchForm, setMatchForm] = useState({
    date: new Date().toISOString().slice(0,10),
    course: '',
    players: {
      nicky: emptyPlayer(),
      jeffy: emptyPlayer()
    }
  })

  // seasonal reset + persist boot
  useEffect(() => {
    const copy = structuredClone(state)
    maybeAutoReset(copy, new Date())
    saveState(copy)
    setState(copy)
  }, []) // eslint-disable-line

  // persist any change
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
    return { jeffy: calc('jeffy'), nicky: calc('nicky') }
  }, [matchForm])

  // summary panel
  const summary = useMemo(() => {
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

  // handlers
  function setHole(pid, idx, val) {
    const v = val === '' ? '' : Math.max(0, Number(val))
    setMatchForm(f => {
      const next = structuredClone(f)
      next.players[pid].holes[idx] = v
      return next
    })
  }

  function setExtra(pid, key, val) {
    setMatchForm(f => {
      const next = structuredClone(f)
      next.players[pid][key] = val
      return next
    })
  }

  function commitMatch() {
    // store per-hole arrays + compute totals; also set legacy "score" for History/Summary
    const payload = {
      date: matchForm.date,
      course: matchForm.course || '',
      players: [
        {
          id:'nicky',
          holes: matchForm.players.nicky.holes.map(n=>Number(n)||0),
          ctp: matchForm.players.nicky.ctp,
          putt30: matchForm.players.nicky.putt30,
          putt40: matchForm.players.nicky.putt40,
          putt50: matchForm.players.nicky.putt50,
          longPuttDistance: matchForm.players.nicky.longPuttDistance,
          ob: Number(matchForm.players.nicky.ob)||0,
          score: totals.nicky.total
        },
        {
          id:'jeffy',
          holes: matchForm.players.jeffy.holes.map(n=>Number(n)||0),
          ctp: matchForm.players.jeffy.ctp,
          putt30: matchForm.players.jeffy.putt30,
          putt40: matchForm.players.jeffy.putt40,
          putt50: matchForm.players.jeffy.putt50,
          longPuttDistance: matchForm.players.jeffy.longPuttDistance,
          ob: Number(matchForm.players.jeffy.ob)||0,
          score: totals.jeffy.total
        }
      ]
    }
    const copy = structuredClone(state)
    addMatch(copy, payload)
    saveState(copy)
    setState(copy)
    alert('Match saved.')
    // reset form for new round
    setMatchForm(m => ({ ...m, course:'', players: { nicky: emptyPlayer(), jeffy: emptyPlayer() } }))
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

          {/* FRONT 9 */}
          <div className="card" style={{overflowX:'auto'}}>
            <h4 style={{marginTop:0}}>Front 9</h4>
            <table>
              <thead>
                <tr>
                  <th style={{width:110}}>Name</th>
                  {FRONT.map(h=><th key={h}>{h}</th>)}
                  <th>Front</th>
                </tr>
              </thead>
              <tbody>
                {['nicky','jeffy'].map(pid=>(
                  <tr key={pid}>
                    <td style={{fontWeight:700}}>{pid==='nicky'?'Nicky':'Jeffy'}</td>
                    {FRONT.map((h,i)=>(
                      <td key={h}>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={matchForm.players[pid].holes[i]}
                          onChange={e=>setHole(pid, i, e.target.value)}
                          style={{width:'3.2rem'}}
                        />
                      </td>
                    ))}
                    <td><b>{pid==='nicky'?totals.nicky.front:totals.jeffy.front}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* BACK 9 */}
          <div className="card" style={{overflowX:'auto'}}>
            <h4 style={{marginTop:0}}>Back 9</h4>
            <table>
              <thead>
                <tr>
                  <th style={{width:110}}>Name</th>
                  {BACK.map((h,idx)=><th key={h}>{h}</th>)}
                  <th>Back</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {['nicky','jeffy'].map(pid=>(
                  <tr key={pid}>
                    <td style={{fontWeight:700}}>{pid==='nicky'?'Nicky':'Jeffy'}</td>
                    {BACK.map((h,idx)=>(
                      <td key={h}>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={matchForm.players[pid].holes[9+idx]}
                          onChange={e=>setHole(pid, 9+idx, e.target.value)}
                          style={{width:'3.2rem'}}
                        />
                      </td>
                    ))}
                    <td><b>{pid==='nicky'?totals.nicky.back:totals.jeffy.back}</b></td>
                    <td><b>{pid==='nicky'?totals.nicky.total:totals.jeffy.total}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Extras / stats */}
          <div className="row">
            {['nicky','jeffy'].map(pid=>(
              <div key={pid} className="card" style={{background:'#fafafa'}}>
                <h4 style={{marginTop:0}}>{pid==='nicky'?'Nicky':'Jeffy'} — Extras</h4>
                <div className="row3">
                  <label className="flex">
                    <input type="checkbox"
                      checked={matchForm.players[pid].ctp}
                      onChange={e=>setExtra(pid,'ctp',e.target.checked)} /> CTP
                  </label>
                  <label className="flex">
                    <input type="checkbox"
                      checked={matchForm.players[pid].putt30}
                      onChange={e=>setExtra(pid,'putt30',e.target.checked)} /> Outside 30’
                  </label>
                  <label className="flex">
                    <input type="checkbox"
                      checked={matchForm.players[pid].putt40}
                      onChange={e=>setExtra(pid,'putt40',e.target.checked)} /> Outside 40’
                  </label>
                </div>
                <div className="row3">
                  <label className="flex">
                    <input type="checkbox"
                      checked={matchForm.players[pid].putt50}
                      onChange={e=>setExtra(pid,'putt50',e.target.checked)} /> Outside 50’
                  </label>
                  <div>
                    <label>Long putt distance (ft)</label>
                    <input type="number"
                           value={matchForm.players[pid].longPuttDistance}
                           onChange={e=>setExtra(pid,'longPuttDistance',e.target.value)} />
                  </div>
                  <div>
                    <label>OB (count)</label>
                    <input type="number"
                           value={matchForm.players[pid].ob}
                           onChange={e=>setExtra(pid,'ob',e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

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
                const notes = [
                  pj.ctp?'J-CTP':'' , pn.ctp?'N-CTP':'',
                  pj.putt30?'J-30ft':'', pn.putt30?'N-30ft':'',
                  pj.putt40?'J-40ft':'', pn.putt40?'N-40ft':'',
                  pj.putt50?'J-50ft':'', pn.putt50?'N-50ft':'',
                  pj.ob?`J-OB:${pj.ob}`:'', pn.ob?`N-OB:${pn.ob}`:'',
                  pj.longPuttDistance?`J-LP:${pj.longPuttDistance}`:'',
                  pn.longPuttDistance?`N-LP:${pn.longPuttDistance}`:'',
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
              <div>Wins: <b>{summary.jeffy.wins}</b></div>
              <div>Matches: <b>{summary.jeffy.played}</b></div>
              <div>Avg Score: <b>{summary.jeffy.played ? (summary.jeffy.scoreSum/summary.jeffy.played).toFixed(1) : '-'}</b></div>
              <div className="muted">BUBBLY points: <b>{state.bubbly.tallies.jeffy.points}</b></div>
              <div className="muted">Items: {Object.entries(state.bubbly.tallies.jeffy.items||{}).map(([k,v])=>`${k}×${v}`).join(', ') || '-'}</div>
            </div>
            <div className="card">
              <h4>Nicky</h4>
              <div>Wins: <b>{summary.nicky.wins}</b></div>
              <div>Matches: <b>{summary.nicky.played}</b></div>
              <div>Avg Score: <b>{summary.nicky.played ? (summary.nicky.scoreSum/summary.nicky.played).toFixed(1) : '-'}</b></div>
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
