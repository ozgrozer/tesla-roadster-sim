// Mission: steal a particular car (a sports car, parked in a lot across town) and bring it to the
// garage, unscratched enough to sell
export const DELIVER = {
  id: 'deliver',
  title: 'Special Order',
  brief: 'A buyer wants a sports car. Find one, take it, and bring it to the garage.',
  start: [0.82, 0.62],
  color: '#6fcf97',
  reward: 3000,
  // (a car of the model parked for the player to take, near this place: game.js)
  target: { model: 'sports', near: [0.62, 0.82] },
  objectives: [
    { type: 'steal', model: 'sports', text: 'Steal the <b>sports car</b>' },
    { type: 'deliver', model: 'sports', at: [0.9, 0.9], r: 9, text: 'Deliver it to the <b>garage</b>' }
  ]
}
