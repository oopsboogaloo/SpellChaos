import { z } from 'zod';
const id=z.string().min(1).max(128);
const hex=z.strictObject({q:z.number().int().min(-100000).max(100000),r:z.number().int().min(-100000).max(100000)});
export const structureTargetSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('wall'),id}),
 z.strictObject({kind:z.literal('weed'),id,hex}),
]);
export type StructureTarget=z.infer<typeof structureTargetSchema>;
