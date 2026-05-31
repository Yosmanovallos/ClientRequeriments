import type { IClock } from '../../Ports/IClock';

/** LocalClock — returns real system time. Exists so tests can inject a fixed clock. */
export class LocalClock implements IClock {
  now(): Date { return new Date(); }
}
