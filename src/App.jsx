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
  const [state, setState] = usestate(loadstate());
  const [view, setView] = usestate('match');
  const [filter, setFilter] = usestate('current');
  const [matchForm, setMatchForm] = usestate({
    date: new Date().toISOString().slice(0,10),
    course: '',
    players: {
      jeffy: { score: 0, ctp:false, putt30:false, putt40:false, putt50:false, longPuttDistance:'', ob:0 },
      nicky: { score: 0, ctp:false, putt30:false, putt40:false, putt50:false, longPuttDistance:'', ob:0 },
    }
  });
  const [bubblyResult, setBubblyResult] = usestate(null);
  const [assignTo, setAssignTo] = usestate('jeffy');

  useEffect(() => {
    const copy = structuredClone(state);
    maybeAutoReset(copy, new Date());
    savestate(copy);
    setstate(copy);
  }, []);

  useEffect(() => {
    savestate(state);
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
    savestate(copy);
    setstate(copy);
    alert('Match saved.');
  }

  function doBubbly(){
    const copy = structuredClone(state);
    const item = bubblyRandomPick(copy);
    if (!item) { alert('BUBBLY pool is empty.'); return; }
    applyBubblyAward(copy, item, assignTo);
    savestate(copy);
    setstate(copy);
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
    savestate(copy);
    setstate(copy);
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

      {view==='match' && (
        <Section title="Enter Match">
          <div className="row">
            <div>
              <label>Date</label>
              <input type="date" value={matchForm.date} onChange={e=>setMatchForm({...matchForm, date:e.target.value})} />
            </div>
            <div>
              <label>Course</label>
              <input value={matchForm.course} onChange={e=>setMatchForm({...matchForm, course:e.target.value})} placeholder="Course name" />
            </div>
          </div>

          <div className="row">
            {PLAYERS.map(pl => (
              <div key={pl.id} className="card" style={{border:'1px dashed #ccc', background:'#fafafa'}}>
                <h4 style={{marginTop:0}}>{pl.name}</h4>
                <label>Score</label>
                <input type="number" value={matchForm.players[pl.id].score} onChange={e=>setMatchForm({...matchForm, players:{...matchForm.players, [pl.id]:{...matchForm.players[pl.id], score:e.target.value}}})} />

                <div className="row3">
                  <label className="flex"><input type="checkbox" checked={matchForm.players[pl.id].ctp} onChange={e=>setMatchForm({...matchForm, players:{...matchForm.players, [pl.id]:{...matchForm.players[pl.id], ctp:e.target.checked}}})} /> CTP</label>
                  <label className="flex"><input type="checkbox" checked={matchForm.players[pl.id].putt30} onChange={e=>setMatchForm({...matchForm, players:{...matchForm.players, [pl.id]:{...matchForm.players[pl.id], putt30:e.target.checked}}})} /> Outside 30’</label>
                  <label className="flex"><input type="checkbox" checked={matchForm.players[pl.id].putt40} onChange={e=>setMatchForm({...matchForm, players:{...matchForm.players, [pl.id]:{...matchForm.players[pl.id], putt40:e.target.checked}}})} /> Outside 40’</label>
                </div>
                <div className="row3">
                  <label className="flex"><input type="checkbox" checked={matchForm.players[pl.id].putt50} onChange={e=>setMatchForm({...matchForm, players:{...matchForm.players, [pl.id]:{...matchForm.players[pl.id], putt50:e.target.checked}}})} /> Outside 50’</label>
                  <div>
                    <label>Long putt distance (ft)</label>
                    <input type="number" value={matchForm.players[pl.id].longPuttDistance} onChange={e=>setMatchForm({...matchForm, players:{...matchForm.players, [pl.id]:{...matchForm.players[pl.id], longPuttDistance:e.target.value}}})} />
                  </div>
                  <div>
                    <label>OB (count)</label>
                    <input type="number" value={matchForm.players[pl.id].ob} onChange={e=>setMatchForm({...matchForm, players:{...matchForm.players, [pl.id]:{...matchForm.players[pl.id], ob:e.target.value}}})} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className="btn" onClick={commitMatch}>Save Match</button>
        </Section>
      )}

      {view==='history' && (
        <Section title="Match History" right={
          <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="current">Current Season</option>
            <option value="all">All Time</option>
          </select>
        }>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Course</th><th>Jeffy Score</th><th>Nicky Score</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => {
                const pj = m.players.find(p=>p.id==='jeffy') || {};
                const pn = m.players.find(p=>p.id==='nicky') || {};
                const notes = [
                  pj.ctp?'J-CTP':'' , pn.ctp?'N-CTP':'',
                  pj.putt30?'J-30ft':'', pn.putt30?'N-30ft':'',
                  pj.putt40?'J-40ft':'', pn.putt40?'N-40ft':'',
                  pj.putt50?'J-50ft':'', pn.putt50?'N-50ft':'',
                  pj.ob?`J-OB:${pj.ob}`:'', pn.ob?`N-OB:${pn.ob}`:'',
                  pj.longPuttDistance?`J-LP:${pj.longPuttDistance}`:'',
                  pn.longPuttDistance?`N-LP:${pn.longPuttDistance}`:'',
                ].filter(Boolean).join(' · ');
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

      {view==='bubbly' && (
        <Section title="BUBBLY" right={
          <select value={assignTo} onChange={e=>setAssignTo(e.target.value)}>
            <option value="jeffy">Jeffy</option>
            <option value="nicky">Nicky</option>
          </select>
        }>
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
                <li key={i}>{new Date(h.timestamp).toLocaleString()} — {h.winnerId} got <b>{h.itemLabel}</b> {h.type==='points'?`(${h.delta>0?'+':''}${h.delta})`:''}</li>
              ))}
            </ul>
          </details>
        </Section>
      )}

      {view==='settings' && (
        <Section title="Settings">
          <div className="row">
            <div className="card">
              <h4>Data</h4>
              <button className="btn secondary" onClick={manualResetBubbly}>Reset BUBBLY now</button>
              <div style={{height:8}} />
              <button className="btn secondary" onClick={()=>{ if(confirm('Wipe all data?')) { const copy = structuredClone(state); wipeAll(copy); saveState(copy); setState(copy);} }}>Wipe all data</button>
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
