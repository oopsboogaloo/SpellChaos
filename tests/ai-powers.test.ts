import { expect, it } from 'vitest';
import { fight, roster } from '../tools/arena/fight.js';

// #60: the AI used to repeat a power every turn (Basilisk Gaze, Ghost Frighten) and never attack.
it.each(['Serpent:5', 'Spirit:3'])('the AI attacks with %s instead of only repeating its power', key => {
  const list = roster(),
    me = list.find(f => f.key === key)!,
    lion = list.find(f => f.key === 'Cat:3')!;
  let attacks = 0;
  for (const seed of [1, 2, 3]) attacks += fight(me, lion, seed).sides.a.attacks;
  expect(attacks).toBeGreaterThan(0);
});
