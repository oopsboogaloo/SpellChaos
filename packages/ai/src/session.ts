import {z} from 'zod';
import {stateSchema,type GameState} from '../../domain/src/state.js';
import {canonical,encodeSnapshot} from '../../persistence/src/snapshot.js';
import {stateFingerprint} from '../../persistence/src/digest.js';
import {applySystemCommand,systemCommand} from '../../engine/src/index.js';
import {advanceAtomicStep} from '../../engine/src/resolver.js';
import {submitAiTurn} from './coordinator.js';
import {POLICY_VERSION} from './policy.js';
const uint=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const sessionSchema=z.strictObject({sessionVersion:z.literal(1),policyVersion:z.literal(POLICY_VERSION),state:stateSchema,
 options:z.strictObject({difficulty:z.enum(['easy','standard','hard']),maxTurns:uint.min(1).max(10000),maxAtomicSteps:uint.min(1).max(10000000),maxPlanningWork:uint.min(1).max(100000000)}),
 atomicSteps:uint,planningWork:uint,candidates:uint,expanded:uint,fallbacks:uint,
 outcome:z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('winner'),playerId:z.string()}),z.strictObject({type:z.literal('draw')}),
  z.strictObject({type:z.literal('timeout'),reason:z.enum(['turn-limit','atomic-step-limit','planning-work-limit'])}),
  z.strictObject({type:z.literal('failure'),message:z.string(),phase:z.string(),turn:uint}),
 ]).nullable(),
}).superRefine((s,ctx)=>{
 if(s.atomicSteps>s.options.maxAtomicSteps||s.planningWork>s.options.maxPlanningWork)ctx.addIssue({code:'custom',message:'INVALID_HARNESS_COUNTERS'});
 if(s.outcome?.type==='winner'&&s.state.result?.type!=='winner'||s.outcome?.type==='draw'&&s.state.result?.type!=='draw')ctx.addIssue({code:'custom',message:'INVALID_HARNESS_RESULT'});
 if(s.outcome?.type==='winner'&&s.state.result?.type==='winner'&&s.outcome.playerId!==s.state.result.playerId)ctx.addIssue({code:'custom',message:'INVALID_HARNESS_WINNER'});
 if(s.outcome?.type==='timeout'&&s.state.result!==null)ctx.addIssue({code:'custom',message:'TIMEOUT_IS_NOT_ENGINE_RESULT'});
});
export type MatchSession=z.infer<typeof sessionSchema>;
export function createMatchSession(state:GameState,options:Partial<MatchSession['options']>={}):MatchSession {
 return sessionSchema.parse({sessionVersion:1,policyVersion:POLICY_VERSION,state,options:{difficulty:'standard',maxTurns:100,maxAtomicSteps:100000,maxPlanningWork:10000000,...options},atomicSteps:0,planningWork:0,candidates:0,expanded:0,fallbacks:0,outcome:null});
}
export const encodeMatchSession=(session:MatchSession)=>canonical(sessionSchema.parse(session));
export function restoreMatchSession(text:string):MatchSession {try{return sessionSchema.parse(JSON.parse(text));}catch{throw new Error('INVALID_OR_UNSUPPORTED_MATCH_SESSION');}}
/** One published harness boundary is a full frozen-view planning batch, the
 * StartResolution command, or one native engine atomic step. Counters persist. */
export function advanceMatchSession(session:MatchSession):MatchSession {
 if(session.outcome)return session;
 const next={...session};
 try{
  if(next.state.result){next.outcome=structuredClone(next.state.result);return next;}
  if(next.state.turn>next.options.maxTurns){next.outcome={type:'timeout',reason:'turn-limit'};return next;}
  if(next.state.phase==='planning'){
   const remaining=next.options.maxPlanningWork-next.planningWork;
   if(remaining===0){next.outcome={type:'timeout',reason:'planning-work-limit'};return next;}
   const plan=submitAiTurn(next.state,next.state.players.map(p=>p.id),next.options.difficulty,remaining);
   next.planningWork+=plan.work;next.candidates+=plan.candidates;next.expanded+=plan.expanded;
   if(plan.truncated){next.outcome={type:'timeout',reason:'planning-work-limit'};return next;}
   next.state=plan.state;next.fallbacks+=plan.fallbacks;
  }else if(next.state.phase==='ready')next.state=applySystemCommand(next.state,systemCommand(next.state,'StartResolution',`harness-start-${next.state.turn}-${next.state.revision}`)).state;
  else{
   if(next.atomicSteps===next.options.maxAtomicSteps){next.outcome={type:'timeout',reason:'atomic-step-limit'};return next;}
   next.state=advanceAtomicStep(next.state).state;next.atomicSteps++;
  }
  if(['planning','ended'].includes(next.state.phase))stateSchema.parse(next.state);
  if(next.state.result)next.outcome=structuredClone(next.state.result);
 }catch(error){next.state=session.state;next.outcome={type:'failure',message:error instanceof Error?error.message:String(error),phase:session.state.phase,turn:session.state.turn};}
 return next;
}
export function runMatch(session:MatchSession):MatchSession {while(!session.outcome)session=advanceMatchSession(session);return session;}
export function matchReport(session:MatchSession){return {policyVersion:session.policyVersion,versions:{schema:session.state.schemaVersion,rules:session.state.rulesVersion,content:session.state.contentVersion},options:session.options,outcome:session.outcome,turn:session.state.turn,atomicSteps:session.atomicSteps,planningWork:session.planningWork,candidates:session.candidates,expanded:session.expanded,fallbacks:session.fallbacks,creatures:session.state.creatures.length,fingerprint:stateFingerprint(session.state),...(session.outcome?.type==='failure'?{privateFailure:{snapshot:encodeSnapshot(session.state),commands:structuredClone(session.state.accepted)}}:{})};}
