import React, { useMemo, useState, useEffect } from 'react'
import { loadState, saveState, addMatch, getMatchesByFilter, bubblyRandomPick, applyBubblyAward, wipeAll, maybeAutoReset, resetBubbly } from './state/storage'
import { getSeasonWindow, formatDate } from './utils/date'

const PLAYERS = [
  { id:'jeffy', name:'Jeffy' },
  { id:'nicky', name:'Nicky' },
];

function Section({title, children, right}) {
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

export default function App(){
  const [state, setState] = useState(loadState());
  const [view, setView] = useState('match');
  const [filter, setFilter] = useState('current');
  const [matchForm, setMatchForm] = useState({
    date: new Date().toISOString().slice(0,10),
    course: '',
    players: {
      jeffy: { score: 0, ctp:false, putt30:false, putt40:false, putt50:false, longPuttDistance:'', ob:0 },
      nicky: { score: 0, ctp:false, putt30:false, putt40:false, putt50:false, longPuttDistance:'', ob:0 },
    }
  });
  const [bubblyResult, setBubblyResult] = useState(null);
  const [assignTo, setAssignTo] = useState('jeffy');

  useEffect(() => {
    const copy = structuredClone(state);
    maybeAutoReset(copy, new Date());
    saveState(copy);
    setState(copy);
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const matches = useMemo(() => getMatchesByFilter(state, filter), [state, filter]);

  function commitMatch(){
    const payload = {
      date: matchForm.date,
      course: matchForm.course || '',
      players: [
        { id:'jeffy', ...matchForm.players.jeffy },
        { id:'nicky', ...matchForm.players.nicky },
      ]
    };
    const copy = structuredClone(state);
    addMatch(copy, payload);
    saveState(copy);
    setState(copy);
    alert('Match saved.');
  }

  function doBubbly(){
    const copy = structuredClone(state);
    const item = bubblyRandomPick(copy);
    if (!item) { alert('BUBBLY pool is empty.'); return; }
    applyBubblyAward(copy, item, assignTo);
    saveState(copy);
    setState(copy);
    setBubblyResult(item);
  }

  const seasonWindow = getSeasonWindow();
  const summary = useMemo(() => {
    const totals = { jeffy:{wins:0, played:0, scoreSum:0}, nicky:{wins:0, played:0, scoreSum:0} };
    matches.forEach(m => {
      const pj = m.players.find(p=>p.id==='jeffy');
      const pn = m.players.find(p=>p.id==='nicky');
      if (!pj || !pn) return;
      totals.jeffy.played++; totals.nicky.played++;
      totals.jeffy.scoreSum += Number(pj.score)||0;
      totals.nicky.scoreSum += Number(pn.score)||0;
      if ((Number(pj.score)||0) < (Number(pn.score)||0)) totals.jeffy.wins++;
      else if ((Number(pn.score)||0) < (Number(pj.score)||0)) totals.nicky.wins++;
    });
    return totals;
  }, [matches]);

  function manualResetBubbly(){
    if (!confirm('Reset BUBBLY pool and tallies? This will archive current tallies into the season history.')) return;
    const copy = structuredClone(state);
    const yr = new Date().getFullYear();
    copy.bubbly.historyArchive = copy.bubbly.historyArchive || [];
    copy.bubbly.historyArchive.push({
      season: `${yr-1}-${yr}`,
      tallies: JSON.parse(JSON.stringify(copy.bubbly.tallies)),
      history: JSON.parse(JSON.stringify(copy.bubbly.history))
    });
    resetBubbly(copy);
    saveState(copy);
    setState(copy);
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
        <span className="pill">Local only</span>
      </nav>

      {/* MATCH ENTRY */}
      {view==='match' && (
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
        </Section>
      )}

      {/* FAB (show only on Match tab) */}
      {view==='match' && (
        <div className="fab">
          <button className="btn" onClick={commitMatch}>Save Match</button>
        </div>
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

  )
}
