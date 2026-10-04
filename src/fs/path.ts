/** Path helpers for the simulated Linux file system. All results are absolute and normalized. */

/** Splits an absolute path into its names: "/home/a/" -> ["home", "a"]. */
export function splitPath(absolute: string): string[] {
  return absolute.split('/').filter((part) => part !== '');
}

export function joinPath(parts: string[]): string {
  return '/' + parts.join('/');
}

/**
 * Resolves what the player typed against the current directory, the way bash
 * does for `cd`: `~` is the home directory, `.` is ignored and `..` goes up
 * one level (never above `/`).
 */
export function resolvePath(cwd: string, input: string, home: string): string {
  let path = input;
  if (path === '~' || path.startsWith('~/')) path = home + path.slice(1);
  if (!path.startsWith('/')) path = cwd + '/' + path;

  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return joinPath(parts);
}

export function dirname(absolute: string): string {
  return joinPath(splitPath(absolute).slice(0, -1));
}

export function basename(absolute: string): string {
  return splitPath(absolute).at(-1) ?? '/';
}

/** Shows a path the way the bash prompt does: the home directory becomes `~`. */
export function tildify(absolute: string, home: string): string {
  if (absolute === home) return '~';
  if (absolute.startsWith(home + '/')) return '~' + absolute.slice(home.length);
  return absolute;
}
