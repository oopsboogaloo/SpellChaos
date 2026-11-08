import { expect, it } from 'vitest';
import { createMatch } from '../packages/engine/src/index.js';
import { applyDamage } from '../packages/engine/src/damage.js';
import { projectEvents } from '../packages/views/src/index.js';
import type { Event } from '../packages/engine/src/events.js';

function hit(invisible: boolean) {
  const s = createMatch('source', ['a', 'b'], 3);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures[1]!.centre = { q: 7, r: 5 };
  if (invisible) s.creatures[1]!.invisible = true;
  const events: Event[] = [];
  applyDamage(s, s.creatures[0]!, [{ type: 'physical', amount: 2 }], events, { sourceId: s.creatures[1]!.id });
  return projectEvents(s, 'a', events).find(e => e.type === 'DamageApplied')!;
}

it('damage events name a source the victim can see, with the amount and damage type', () => {
  expect(hit(false)).toMatchObject({ creatureId: 'wizard-0', sourceId: 'wizard-1', amount: 2, action: 'physical' });
});

it('damage events never reveal an unseen source', () => {
  const e = hit(true);
  expect(e.amount).toBe(2);
  expect(e.sourceId).toBeUndefined();
});
