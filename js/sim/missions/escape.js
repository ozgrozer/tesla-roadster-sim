// Mission: stir up the police until three stars, then shake them off
export const ESCAPE = {
  id: 'escape',
  title: 'Heat Wave',
  brief: 'Get the cops on your tail, three stars of them, then lose them.',
  start: [0.6, 0.7],
  color: '#eb5757',
  reward: 2500,
  objectives: [
    { type: 'wanted', stars: 3, text: 'Get a <b>3-star</b> wanted level' },
    { type: 'evade', text: 'Lose the <b>cops</b>' }
  ],
  // (on starting: a little heat to get it going, as GTA's do)
  wanted: 1
}
