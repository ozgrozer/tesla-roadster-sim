// Mission: a timed checkpoint race round the middle of town, each checkpoint buying a little time
export const RACE = {
  id: 'race',
  title: 'Boulevard Sprint',
  brief: 'Hit every checkpoint before the clock runs out.',
  start: [0.3, 0.3],
  color: '#56ccf2',
  reward: 1500,
  objectives: [
    {
      type: 'checkpoints',
      points: [[0.5, 0.3], [0.7, 0.3], [0.7, 0.5], [0.5, 0.6], [0.3, 0.6], [0.3, 0.42]],
      r: 11,
      bonus: 6
    }
  ],
  timer: 55
}
