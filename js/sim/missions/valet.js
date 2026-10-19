// Mission: a valet run: collect a client from the car park, then get them to their dinner in
// Beverly Hills on time; the tip grows with the time to spare
export const VALET = {
  id: 'valet',
  title: 'Valet Run',
  brief: 'Collect the client from the car park and get them to dinner on time.',
  start: [0.55, 0.55],
  color: '#27ae60',
  reward: 900,
  tip: 12,
  objectives: [
    { type: 'pickup', lot: [0.8, 0.8], r: 14, wait: 2, time: 60, text: 'Pick up the client in the <b>car park</b>' },
    { type: 'dropoff', at: [0.35, 0.12], r: 9, wait: 1, time: 85, text: 'Take them to dinner in <b>Beverly Hills</b>' }
  ]
}
