import { createMatch, applyCommand, applySystemCommand, systemCommand } from '../../engine/src/index.js';
import type { GameState, Order } from '../../domain/src/state.js';

/** Fixed review scenario using production commands: triple attack, Guard, poison and end batches. */
export function combatScenario(): GameState {
  let s = createMatch('combat-review', ['attacker', 'mover', 'guard'], 4004);
  const [attacker, mover, guard] = s.creatures;
  attacker!.centre = { q: 5, r: 5 };
  attacker!.dex = 9;
  attacker!.attacks[0]!.shots = Array.from({ length: 3 }, () => ({
    skill: 99,
    crit: 0,
    components: [{ type: 'physical' as const, amount: 1 }],
    secondary: [
      { kind: 'Poisoned' as const, potency: 99, resistance: 'con' as const, duration: 3, requiresDamage: true },
    ],
  }));
  mover!.centre = { q: 6, r: 5 };
  guard!.centre = { q: 8, r: 5 };
  guard!.attacks[0]!.shots[0]!.skill = 99;
  guard!.attacks[0]!.shots[0]!.crit = 0;
  const orders: Order[] = [
    {
      creatureId: attacker!.id,
      path: [],
      early: { type: 'Attack', attackId: 'staff', targetIds: [mover!.id], ground: null, side: 'left' },
      late: null,
    },
    {
      creatureId: mover!.id,
      path: [
        { q: 7, r: 5 },
        { q: 7, r: 6 },
        { q: 6, r: 6 },
      ],
      early: 'Dash',
      late: null,
    },
    {
      creatureId: guard!.id,
      path: [],
      early: { type: 'Guard', attackId: 'staff', targetId: null, area: [] },
      late: null,
    },
  ];
  for (const order of orders)
    s = applyCommand(s, {
      matchId: s.matchId,
      playerId: s.creatures.find(c => c.id === order.creatureId)!.controller!,
      turn: 1,
      commandId: `order-${order.creatureId}`,
      expectedRevision: s.revision,
      type: 'SetOrder',
      order,
    }).state;
  for (const p of s.players)
    s = applyCommand(s, {
      matchId: s.matchId,
      playerId: p.id,
      turn: 1,
      commandId: `lock-${p.id}`,
      expectedRevision: s.revision,
      type: 'LockTurn',
    }).state;
  return applySystemCommand(s, systemCommand(s, 'StartResolution', 'start')).state;
}
