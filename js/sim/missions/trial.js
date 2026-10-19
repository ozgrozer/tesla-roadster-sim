// Mission: a time trial round the edge of town (the coast road, the hills' edge, downtown and
// back): no time back for the checkpoints, just the clock; the hill road (the world workstream's)
// will make a better course once it is in
export const TRIAL = {
  id: 'trial',
  title: 'Coast to Core',
  brief: 'One lap of the edge of town against the clock. No time back: drive clean.',
  start: [0.05, 0.6],
  color: '#f2c94c',
  reward: 1800,
  objectives: [
    {
      type: 'checkpoints',
      points: [[0.03, 0.3], [0.05, 0.03], [0.4, 0.03], [0.75, 0.05], [0.95, 0.35], [0.7, 0.55], [0.35, 0.55], [0.06, 0.62]],
      r: 12
    }
  ],
  timer: 95
}
