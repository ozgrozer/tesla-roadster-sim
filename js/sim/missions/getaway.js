// Mission: a getaway: the alarm is already ringing (two stars), get to the safehouse garage before
// the clock runs out, then lie low there until the heat dies down
export const GETAWAY = {
  id: 'getaway',
  title: 'Smash and Dash',
  brief: 'The alarm is ringing. Reach the safehouse before they close the net, then lose them.',
  start: [0.85, 0.2],
  color: '#bb6bd9',
  reward: 2200,
  wanted: 2,
  objectives: [
    { type: 'goto', at: [0.35, 0.75], r: 10, time: 70, vehicle: true, text: 'Get to the <b>safehouse</b>' },
    { type: 'evade', text: 'Lie low: lose the <b>cops</b>' }
  ]
}
