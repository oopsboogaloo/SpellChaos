/** Scheduling adapter only: the simulation does not read a clock. */
export interface Clock { now(): number }
export class ManualClock implements Clock {
  constructor(private time = 0) {}
  now(): number { return this.time; }
  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('INVALID_TIME');
    this.time += milliseconds;
  }
}
export function deadlineReached(clock: Clock, deadline: number | null): boolean {
  return deadline !== null && clock.now() >= deadline;
}
