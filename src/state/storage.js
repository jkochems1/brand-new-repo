// src/state/storage.js
import { getSeasonWindow } from '../utils/date'

const KEY = 'dg-state-v1'

const DEFAULT_PLAYERS = [
  { id: 'jeffy', name: 'Jeffy' },
  { id: 'nicky', name: 'Nicky' },
]

export const DEFAULT_BUBBLY = {
  items: [
    { label: '+1 points', qty: 150, type: 'points', delta: 1 },
    { label: '+2 points', qty: 50, type: 'points', delta: 2 },
    { label: '+3 points', qty: 25, type: 'points', delta: 3 },
    { label: '+5 points', qty: 10, type: 'points', delta: 5 },
    { label: '+10 points', qty: 3, type: 'points', delta: 10 },
    { label: '+15 points', qty: 1, type: 'points', delta: 15 },
    { label: '-1 points', qty: 75, type: 'points', delta: -1 },
    { label: '-2 points', qty: 25, type: 'points', delta: -2 },
    { label: '-3 points', qty: 10, type: 'points', delta: -3 },
    { label: '-5 points', qty: 4, type: 'points', delta: -5 },
    { label: '-10 points', qty: 2, type: 'points', delta: -10 },
    { label: '-15 points', qty: 1, type: 'points', delta: -15 },
    { label: '+1 corndog', qty: 25, type: 'reward' },
    { label: '+1 $4 fridge', qty: 25, type: 'reward' },
    { label: '+1 $8 fridge', qty: 15, type: 'reward' },
    { label: '+1 bottle of bubbly', qty: 15, type: 'reward' },
    { label: '+1 taco 12 pack', qty: 10, type: 'reward' },
    { label: '+1 hot dog weekend', qty: 5, type: 'reward' },
    { label: '+1 batting cages', qty: 5, type: 'reward' },
    { label: '+1 driving range', qty: 5, type: 'reward' },
    { label: '+1 round of wings', qty: 5, type: 'reward' },
    { label: '+1 opponent buys drinks for next round', qty: 14, type: 'reward' },
    { label: '-1 hot dog weekend', qty: 2, type: 'penalty' },
    { label: '-1 batting cages', qty: 2, type: 'penalty' },
    { label: '-1 driving range', qty: 2, type: 'penalty' },
    { label: '-1 round of wings', qty: 2, type: 'penalty' },
    { label: 'YOU buy next round of drinks', qty: 2, type: 'penalty' },
  ]
}

const initialState = () => ({
  players: DEFAULT_PLAYERS,
  matches: [],
  bubbly: {
    pool: DEFAULT_BUBBLY.items.map(x => ({ ...x })),
    history: [],
    tallies: {
      jeffy: { points: 0, items: {} },
      nicky: { points: 0, items: {} }
    },
    lastResetYear: null,
    historyArchive: [],
  }
})

function hydrateMissingFields(s) {
  const base = initialState()
  // players
  if (!Array.isArray(s.players)) s.players = base.players
  // matches
  if (!Array.isArray(s.matches)) s.matches = []
  // bubbly structure
  s.bubbly = s.bubbly || {}
  if (!Array.isArray(s.bubbly.pool) || s.bubbly.pool.length === 0) {
    s.bubbly.pool = base.bubbly.pool
  }
  if (!Array.isArray(s.bubbly.history)) s.bubbly.history = []
  if (!s.bubbly.tallies) s.bubbly.tallies = base.bubbly.tallies
  if (typeof s.bubbly.tallies.jeffy?.points !== 'number') s.bubbly.tallies.jeffy = { points:0, items:{} }
  if (typeof s.bubbly.tallies.nicky?.points !== 'number') s.bubbly.tallies.nicky = { points:0, items:{} }
  if (!Array.isArray(s.bubbly.historyArchive)) s.bubbly.historyArchive = []
  if (!s.bubbly.lastResetYear) s.bubbly.lastResetYear = new Date().getFullYear() - 1
  return s
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw)
    return hydrateMissingFields(parsed)
  } catch {
    return initialState()
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function resetBubbly(state) {
  state.bubbly.pool = DEFAULT_BUBBLY.items.map(x => ({ ...x }))
  state.bubbly.history = []
  state.bubbly.tallies = {
    jeffy: { points: 0, items: {} },
    nicky: { points: 0, items: {} }
  }
}

export function maybeAutoReset(state, now = new Date()) {
  const yr = now.getFullYear()
  const resetDate = new Date(yr, 6, 5, 0, 0, 0, 0) // July 5 00:00
  if (!state.bubbly.lastResetYear) state.bubbly.lastResetYear = yr - 1
  if (now >= resetDate && state.bubbly.lastResetYear < yr) {
    state.bubbly.historyArchive.push({
      season: `${yr-1}-${yr}`,
      tallies: JSON.parse(JSON.stringify(state.bubbly.tallies)),
      history: JSON.parse(JSON.stringify(state.bubbly.history))
    })
    resetBubbly(state)
    state.bubbly.lastResetYear = yr
  }
}

export function addMatch(state, match) {
  state.matches.push({ id: crypto.randomUUID(), ...match })
}

export function getMatchesByFilter(state, filter = 'current') {
  if (filter === 'all') return state.matches
  const { start, end } = getSeasonWindow()
  return state.matches.filter(m => {
    const d = new Date(m.date)
    return d >= start && d <= end
  })
}

export function bubblyRandomPick(state) {
  const total = state.bubbly.pool.reduce((sum, it) => sum + (it.qty || 0), 0)
  if (total <= 0) return null
  let r = Math.random() * total
  for (const it of state.bubbly.pool) {
    if (it.qty <= 0) continue
    if (r < it.qty) return it
    r -= it.qty
  }
  return null
}

export function applyBubblyAward(state, item, playerId) {
  const poolItem = state.bubbly.pool.find(p => p.label === item.label)
  if (!poolItem || poolItem.qty <= 0) return
  poolItem.qty -= 1

  const t = state.bubbly.tallies[playerId] || (state.bubbly.tallies[playerId] = { points: 0, items: {} })
  if (item.type === 'points') {
    t.points += (item.delta || 0)
  } else {
    t.items[item.label] = (t.items[item.label] || 0) + 1
  }

  state.bubbly.history.push({
    timestamp: new Date().toISOString(),
    winnerId: playerId,
    itemLabel: item.label,
    delta: item.delta || 0,
    type: item.type
  })
}

export function wipeAll(state) {
  const fresh = initialState()
  Object.keys(state).forEach(k => delete state[k])
  Object.assign(state, fresh)
}
