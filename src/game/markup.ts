const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Turns challenge markup into terminal text: `code` and **bold** become bold,
 * and [[term|shown words]] becomes just the shown words.
 */
export function toTerminal(text: string): string {
  return text
    .replace(/`([^`]+)`/g, `${BOLD}$1${RESET}`)
    .replace(/\*\*([^*]+)\*\*/g, `${BOLD}$1${RESET}`)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, term: string, shown?: string) => shown ?? term);
}
