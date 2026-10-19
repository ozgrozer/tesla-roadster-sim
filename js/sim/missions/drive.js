// Mission: a drive across town to a meeting (the simplest: get there, stop in the marker)
export const DRIVE = {
  id: 'drive',
  title: 'Cross Town',
  brief: 'A client is waiting across town. Get there, and stop in the marker.',
  start: [0.15, 0.48],
  color: '#f2c94c',
  reward: 600,
  objectives: [{ type: 'goto', at: [0.88, 0.22], r: 9, stop: true, text: 'Drive to the <b>meeting</b> and stop' }],
  timer: 240
}
