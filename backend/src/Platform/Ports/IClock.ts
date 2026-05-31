export interface IClock {
  /** Returns the current UTC date/time. Use this instead of `new Date()` everywhere in business logic. */
  now(): Date;
}
