/** One model provider, as the council needs it. Errors are thrown with user-facing messages. */
export interface Engine {
  /** Shown in the UI and saved with each audit, e.g. "Claude Opus 5.5". */
  label: string;
  /** Streams a plain-text answer, calling `onText` with each delta. Resolves to the full text. */
  streamText(args: {
    system: string;
    user: string;
    onText: (delta: string) => void;
    signal?: AbortSignal;
  }): Promise<string>;
  /** Returns JSON matching `schema` (parsed, not yet shape-checked). */
  generateJson(args: { system: string; user: string; schema: object; signal?: AbortSignal }): Promise<unknown>;
}
