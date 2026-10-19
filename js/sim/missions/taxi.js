// Mission: a taxi fare: pick someone up, take them across town quickly; the fare grows with time
// to spare
export const TAXI = {
  id: 'taxi',
  title: 'Fare Game',
  brief: 'Pick up the fare and get them where they are going, fast.',
  start: [0.45, 0.85],
  color: '#f2994a',
  reward: 400,
  tip: 20, // $ for every second left on the clock
  objectives: [
    { type: 'pickup', at: [0.4, 0.62], r: 9, wait: 1.5, text: 'Pick up the <b>passenger</b>' },
    { type: 'dropoff', at: [0.18, 0.2], r: 9, wait: 1, time: 75, text: 'Take them to <b>Santa Monica</b>' }
  ]
}
