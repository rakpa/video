/** Tiny timestamped logger so output is greppable without a heavy dependency. */
const stamp = () => new Date().toISOString();

export const logger = {
  info: (...args: unknown[]) => console.log(`[${stamp()}] [info]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${stamp()}] [warn]`, ...args),
  error: (...args: unknown[]) => console.error(`[${stamp()}] [error]`, ...args),
};
