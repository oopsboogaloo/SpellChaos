import { migrateOrdersSnapshot } from '../packages/persistence/src/migration.js';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { createMatch, createCreature, applyCommand, applySystemCommand, systemCommand, type Event } from '../packages/engine/src/index.js';
import { advanceAtomicStep, isDefending } from '../packages/engine/src/resolver.js';
import { effectiveMove, replaceReservation } from '../packages/engine/src/orders.js';
import { buildQueue, type Candidate } from '../packages/engine/src/queue.js';
import { expirePlanning } from '../packages/engine/src/scheduler.js';
import { ManualClock } from '../packages/engine/src/clock.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { projectView } from '../packages/views/src/index.js';
import type { GameState, Order } from '../packages/domain/src/state.js';

const h = (q: number, r: number) => ({ q, r });
function fresh(): GameState {
  const s = createMatch('match', ['p1','p2'], 123);
  s.creatures[0]!.centre = h(5,5); s.creatures[1]!.centre = h(15,15);
  return s;
}
const order = (creatureId = 'wizard-0', path: Order['path'] = [], early: Order['early'] = null, late: Order['late'] = null): Order => ({ creatureId, path, early, late });
function command(s: GameState, playerId: string, payload: Record<string, unknown>) {
  return { matchId: s.matchId, turn: s.turn, playerId, commandId: `c-${s.revision}`, expectedRevision: s.revision, ...payload };
}
function submit(s: GameState, o: Order, playerId = 'p1'): GameState { return applyCommand(s, command(s, playerId, { type: 'SetOrder', order: o })).state; }
function start(s: GameState): GameState {
  for (const p of s.players.filter(p => !p.locked)) s = applyCommand(s, command(s,p.id,{type:'LockTurn'})).state;
  return applySystemCommand(s, systemCommand(s,'StartResolution',`start-${s.turn}`)).state;
}
function run(s: GameState, pauseRestore = false): { state: GameState; events: Event[] } {
  const events: Event[] = [];
  for (let steps = 0; ['early','movement','late','end'].includes(s.phase); steps++) {
    if (steps > 1000) throw new Error('TEST_STEP_LIMIT');
    if (pauseRestore) s = restoreSnapshot(encodeSnapshot(s));
    const r = advanceAtomicStep(s); s = r.state; events.push(...r.events);
  }
  return {state:s,events};
}
const candidate = (creatureId: string, overrides: Partial<Candidate> = {}): Candidate => ({ creatureId, dex:5, move:4,size:2,wizardDistance:0,slowed:false,quick:false,...overrides });

describe('drafts and action budgets', () => {
  it('revises and clears drafts atomically and defaults unordered units to Total Defence', () => {
    let s = submit(fresh(), order('wizard-0',[h(6,5)],'Defend'));
    s = submit(s,order('wizard-0',[h(5,6)],null,'Defend'));
    expect(s.orders).toEqual([order('wizard-0',[h(5,6)],null,'Defend')]);
    s = applyCommand(s,command(s,'p1',{type:'ClearOrder',creatureId:'wizard-0'})).state;
    s = start(s);
    expect(s.orders.every(o => o.early === 'TotalDefence' && o.path.length === 0)).toBe(true);
    expect(run(s).state.creatures.map(c=>c.centre)).toEqual(fresh().creatures.map(c=>c.centre));
  });
  it('rejects foreign control, excessive movement, disconnected paths and late Dash without mutation', () => {
    const s = fresh(), before = encodeSnapshot(s);
    for (const o of [order('wizard-1'),order('wizard-0',[h(6,5),h(7,5),h(8,5)]),order('wizard-0',[h(8,5)]),order('wizard-0',[],null,'Dash')]) {
      expect(()=>submit(s,o)).toThrow(); expect(encodeSnapshot(s)).toBe(before);
    }
  });
  it('enforces ordinary/Double Action, Subdued and Total Defence whole-turn budgets', () => {
    const s = fresh();
    expect(()=>submit(s,order('wizard-0',[],'Defend','Defend'))).toThrow('ACTION_BUDGET');
    s.creatures[0]!.doubleAction = true;
    expect(submit(s,order('wizard-0',[],'Defend','Defend')).orders).toHaveLength(1);
    expect(()=>submit(s,order('wizard-0',[],'TotalDefence','Defend'))).toThrow('TOTAL_DEFENCE');
    expect(()=>submit(s,order('wizard-0',[h(6,5)],'TotalDefence'))).toThrow('TOTAL_DEFENCE');
    s.creatures[0]!.subdued = true;
    expect(()=>submit(s,order('wizard-0',[h(6,5)],'Defend'))).toThrow('SUBDUED');
    expect(()=>submit(s,order('wizard-0',[],'Defend','Defend'))).toThrow('ACTION_BUDGET');
    expect(submit(s,order('wizard-0',[h(6,5)])).orders).toHaveLength(1);
  });
  it('applies Defend for the entire chosen phase before its initiative', () => {
    const s = start(submit(fresh(),order('wizard-0',[h(6,5)],null,'Defend')));
    expect(isDefending(s,'wizard-0','early')).toBe(false);
    expect(isDefending(s,'wizard-0','late')).toBe(true);
    expect(isDefending(s,'wizard-1','early')).toBe(true);
    expect(isDefending(s,'wizard-1','late')).toBe(true);
  });
  it('halves positive Slowed movement, preserves zero and prevents restrained movement', () => {
    const s = fresh(), c=s.creatures[0]!; c.move=3;c.slowed=true;
    expect(effectiveMove(c)).toBe(1);c.move=0;expect(effectiveMove(c)).toBe(0);
    expect(()=>submit(s,order('wizard-0',[h(6,5)],'Dash'))).toThrow('MOVEMENT_BUDGET');
    c.move=4;c.restrained=true;
    expect(()=>submit(s,order('wizard-0',[h(6,5)]))).toThrow('MOVEMENT_BUDGET');
    expect(submit(s,order('wizard-0',[],'Defend')).orders).toHaveLength(1);
  });
  it('reserves, replaces and cancels resources without overspending or mutating the prior ledger', () => {
    const a=replaceReservation([],{orderId:'a',creatureId:'u',amount:40},50);
    expect(()=>replaceReservation(a,{orderId:'b',creatureId:'u',amount:20},50)).toThrow('INSUFFICIENT_MANA');
    expect(a).toEqual([{orderId:'a',creatureId:'u',amount:40}]);
    expect(replaceReservation(a,{orderId:'a',creatureId:'u',amount:10},50)[0]!.amount).toBe(10);
    expect(replaceReservation(a,{orderId:'a',creatureId:'u',amount:0},50)).toEqual([]);
  });
  it('does not expose opponents drafts, reservations or random queue keys', () => {
    const s=fresh(), a=projectView(s,'p2'), changed=submit(s,order('wizard-0',[h(6,5)],'Defend'));
    expect(projectView(changed,'p2')).toEqual(a);
    expect(projectView(changed,'p1').orders).toHaveLength(1);
    expect(projectView(changed,'p1')).not.toHaveProperty('cursor');
  });
});

describe('phase queue and atomic movement', () => {
  it('uses Dex, smaller Size and wizard proximity for action initiative', () => {
    const candidates=[candidate('far',{wizardDistance:3}),candidate('near'),candidate('small',{size:1}),candidate('fast',{dex:9})];
    expect(buildQueue(candidates,1,false).entries.map(e=>e.creatureId)).toEqual(['fast','small','near','far']);
  });
  it('uses Move, larger Size and proximity for movement; Slowed then Quick come last', () => {
    const candidates=[candidate('near'),candidate('big',{size:3}),candidate('fast',{move:8}),candidate('far',{wizardDistance:5}),candidate('slow',{slowed:true,dex:99,move:99}),candidate('quick',{quick:true,dex:99})];
    expect(buildQueue(candidates,1,true).entries.map(e=>e.creatureId)).toEqual(['fast','big','near','far','slow','quick']);
  });
  it('assigns unique random ties independently of source-array order', () => {
    const cs=['a','b','c','d'].map(id=>candidate(id));
    expect(buildQueue(cs,1,false)).toEqual(buildQueue([...cs].reverse(),1,false));
    expect(new Set(buildQueue(cs,1,false).entries.map(e=>e.tie)).size).toBe(4);
  });
  it('resolves whole paths in movement order and stops before a still-occupied cell', () => {
    let s=fresh();s.creatures[1]!.centre=h(8,5);s.creatures[1]!.move=3;
    s=submit(s,order('wizard-0',[h(6,5),h(7,5)]));
    s=submit(s,order('wizard-1',[h(7,5)],null,'Defend'),'p2');
    const result=run(start(s));
    expect(result.events.filter(e=>e.type==='CreatureMoved').map(e=>e.creatureId)).toEqual(['wizard-1','wizard-0']);
    expect(result.state.creatures[0]!.centre).toEqual(h(6,5));
    expect(result.state.creatures[1]!.centre).toEqual(h(7,5));
    expect(result.state.turn).toBe(2);
  });
  it('does not swap allied creatures and permits paths into space vacated by a faster creature', () => {
    let s=fresh();s.creatures.push(createCreature('ally','p1',h(6,5),{move:4}));
    s=submit(s,order('wizard-0',[h(6,5)]));s=submit(s,order('ally',[h(7,5)]));
    expect(run(start(s)).state.creatures[0]!.centre).toEqual(h(6,5));
    s=fresh();s.creatures.push(createCreature('ally','p1',h(6,5),{move:4}));
    s=submit(s,order('wizard-0',[h(6,5)]));s=submit(s,order('ally',[h(5,5)]));
    const final=run(start(s)).state;
    expect(final.creatures[0]!.centre).toEqual(h(5,5));expect(final.creatures[2]!.centre).toEqual(h(6,5));
  });
  it('grants Dash movement only after its early action resolves', () => {
    let s=submit(fresh(),order('wizard-0',[h(6,5),h(7,5),h(8,5),h(9,5)],'Dash'));
    const result=run(start(s));expect(result.state.creatures[0]!.centre).toEqual(h(9,5));
    s=start(s);
    s.creatures[0]!.incapacitated=true;
    while(s.phase==='early') s=advanceAtomicStep(s).state;
    s.creatures[0]!.incapacitated=false;
    expect(run(s).state.creatures[0]!.centre).toEqual(h(7,5));
  });
  it('skips not-yet-ready and incapacitated creatures without granting default defence', () => {
    const s=fresh();s.creatures.push(createCreature('new','p1',h(8,8),{readyTurn:2}));
    s.creatures[0]!.incapacitated=true;
    const ready=start(s);
    expect(isDefending(ready,'new','early')).toBe(false);
    expect(run(ready).events.some(e=>e.type==='ActionResolved' && e.creatureId==='new')).toBe(false);
  });
  it('snapshots wizard distances at each phase beginning and retains an already-built queue', () => {
    let s=fresh();s.creatures.push(createCreature('unbound',null,h(8,8)));
    s=start(s);s=advanceAtomicStep(s).state;
    const before=structuredClone(s.cursor.entries);
    s.creatures[0]!.centre=h(12,12);
    s=advanceAtomicStep(s).state;
    expect(s.cursor.entries).toEqual(before);
    expect(before.find(e=>e.creatureId==='unbound')!.wizardDistance).toBe(0);
  });
  it('restores at every atomic boundary with identical events, random state and outcome', () => {
    fc.assert(fc.property(fc.integer({min:1,max:0xffffffff}),seed=>{
      let s=createMatch('match',['p1','p2'],seed);s.creatures[0]!.centre=h(5,5);s.creatures[1]!.centre=h(15,15);
      s=submit(s,order('wizard-0',[h(6,5),h(7,5)],'Dash'));s=start(s);
      expect(run(s,true)).toEqual(run(s));
    }),{seed:3003,numRuns:60});
  });
  it('rejects corrupted mid-resolution cursor and unsupported saved actions', () => {
    const s=advanceAtomicStep(start(fresh())).state;
    const bad=structuredClone(s);bad.cursor.index=999;
    expect(()=>restoreSnapshot(JSON.stringify(bad))).toThrow();
    const badAction=JSON.parse(encodeSnapshot(s));badAction.orders[0].early='Attack';
    expect(()=>restoreSnapshot(JSON.stringify(badAction))).toThrow();
  });
  it('explicitly migrates permanent planning and mid-movement fixtures', () => {
    for (const file of ['orders-v2-planning.json','orders-v2-movement.json']) {
      const text=readFileSync(`tests/fixtures/${file}`,'utf8').trim();
      expect(()=>restoreSnapshot(text)).toThrow();
      const restored=migrateOrdersSnapshot(text);
      expect(restoreSnapshot(encodeSnapshot(restored))).toEqual(restored);
      if(restored.phase==='movement') {
        expect(restored.cursor.pathIndex).toBe(1);
        expect(run(restored,true).state.creatures[0]!.centre).toEqual(h(9,5));
      }
    }
  });
  it('skips a summon that dies after the phase queue snapshot without changing order', () => {
    let s=fresh();s.creatures.push(createCreature('doomed','p1',h(8,8),{dex:99}));
    s=advanceAtomicStep(start(s)).state;
    const queue=structuredClone(s.cursor.entries);
    s.creatures.find(c=>c.id==='doomed')!.alive=false;
    const before=encodeSnapshot(s),result=advanceAtomicStep(s);
    expect(result.events[0]!.type).toBe('ActorSkipped');
    expect(result.state.cursor.entries).toEqual(queue);
    expect(encodeSnapshot(s)).toBe(before);
  });
});

describe('deadlines and surrender', () => {
  it('uses explicit clock deadlines, supports disabled timers and ignores lock/deadline races', () => {
    const clock=new ManualClock(),s=fresh();
    expect(expirePlanning(s,clock,null)).toBeNull();expect(expirePlanning(s,clock,90)).toBeNull();
    clock.advance(90);const timeout=expirePlanning(s,clock,90)!;
    expect(timeout.state.players.every(p=>p.locked && p.missedTurns===1)).toBe(true);
    expect(expirePlanning(timeout.state,clock,90)).toBeNull();
    expect(()=>applyCommand(s,systemCommand(s,'DeadlineReached','forged'))).toThrow('INVALID_COMMAND_AUTHORITY');
    expect(expirePlanning(start(s),clock,90)).toBeNull();
  });
  it('auto-locks the latest draft at deadline and resets missed turns on participation', () => {
    let s=submit(fresh(),order('wizard-0',[h(6,5)]));
    s=applySystemCommand(s,systemCommand(s,'DeadlineReached','d1')).state;
    expect(s.orders).toHaveLength(1);expect(s.players[0]!.missedTurns).toBe(0);
    expect(s.players[1]!.missedTurns).toBe(1);
    s=run(applySystemCommand(s,systemCommand(s,'StartResolution','s1')).state).state;
    s=applyCommand(s,command(s,'p1',{type:'LockTurn'})).state;
    expect(s.players[0]!.missedTurns).toBe(0);
  });
  it('surrenders on the third consecutive miss, unbinds summons and collapses servants/illusions', () => {
    let s=fresh();s.creatures.push(createCreature('pet','p1',h(8,8)),createCreature('zombie','p1',h(10,10),{kind:'reanimated'}),createCreature('fake','p1',h(11,11),{kind:'illusion'}));
    for(let turn=1;turn<=3;turn++) {
      s=applyCommand(s,command(s,'p2',{type:'LockTurn'})).state;
      s=applySystemCommand(s,systemCommand(s,'DeadlineReached',`d${turn}`)).state;
      if(turn<3) s=run(applySystemCommand(s,systemCommand(s,'StartResolution',`s${turn}`)).state).state;
    }
    expect(s.result).toEqual({type:'winner',playerId:'p2'});
    expect(s.creatures.find(c=>c.id==='pet')!.controller).toBeNull();
    expect(s.creatures.find(c=>c.id==='zombie')!.alive).toBe(false);
    expect(s.creatures.find(c=>c.id==='fake')!.alive).toBe(false);
    expect(restoreSnapshot(encodeSnapshot(s))).toEqual(s);
  });
  it('produces a draw when all remaining players surrender together', () => {
    let s=fresh();s.players.forEach(p=>p.missedTurns=2);
    s=applySystemCommand(s,systemCommand(s,'DeadlineReached','d')).state;
    expect(s.result).toEqual({type:'draw'});
  });
});
