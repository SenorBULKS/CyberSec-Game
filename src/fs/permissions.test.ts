import { describe, expect, it } from 'vitest';
import { DEFAULT_MTIME } from './FileSystem';
import { canAccess, modeString, type Credentials } from './permissions';

const file = (owner: string, group: string, mode: number) =>
  ({ type: 'file', owner, group, mode, mtime: DEFAULT_MTIME }) as const;
const dir = (owner: string, group: string, mode: number) =>
  ({ type: 'dir', owner, group, mode, mtime: DEFAULT_MTIME }) as const;

const newhire: Credentials = { user: 'newhire', uid: 1001, groups: ['newhire'] };
const marcus: Credentials = { user: 'mwalker', uid: 1000, groups: ['mwalker', 'sudo'] };
const root: Credentials = { user: 'root', uid: 0, groups: ['root'] };

describe('canAccess', () => {
  it('uses the owner bits for the owner', () => {
    expect(canAccess(file('mwalker', 'mwalker', 0o600), marcus, 'r')).toBe(true);
    expect(canAccess(file('mwalker', 'mwalker', 0o600), newhire, 'r')).toBe(false);
  });

  it('uses the group bits for group members', () => {
    expect(canAccess(file('root', 'sudo', 0o640), marcus, 'r')).toBe(true);
    expect(canAccess(file('root', 'sudo', 0o640), newhire, 'r')).toBe(false);
  });

  it('uses the other bits for everyone else', () => {
    expect(canAccess(file('mwalker', 'mwalker', 0o644), newhire, 'r')).toBe(true);
    expect(canAccess(file('mwalker', 'mwalker', 0o644), newhire, 'w')).toBe(false);
  });

  it('applies only the owner bits to the owner, even when "other" is more generous', () => {
    expect(canAccess(file('newhire', 'newhire', 0o066), newhire, 'r')).toBe(false);
  });

  it('lets root read anything but only execute files with an x bit', () => {
    expect(canAccess(file('mwalker', 'mwalker', 0o000), root, 'r')).toBe(true);
    expect(canAccess(file('mwalker', 'mwalker', 0o644), root, 'x')).toBe(false);
    expect(canAccess(file('mwalker', 'mwalker', 0o744), root, 'x')).toBe(true);
    expect(canAccess(dir('mwalker', 'mwalker', 0o700), root, 'x')).toBe(true);
  });
});

describe('modeString', () => {
  it.each([
    ['dir', 0o755, 'drwxr-xr-x'],
    ['dir', 0o700, 'drwx------'],
    ['dir', 0o750, 'drwxr-x---'],
    ['file', 0o644, '-rw-r--r--'],
    ['file', 0o600, '-rw-------'],
    ['dir', 0o1777, 'drwxrwxrwt'],
    ['dir', 0o1776, 'drwxrwxrwT'],
    ['file', 0o4755, '-rwsr-xr-x'],
    ['file', 0o4644, '-rwSr--r--'],
    ['file', 0o2755, '-rwxr-sr-x'],
  ] as const)('%s %o -> %s', (type, mode, expected) => {
    expect(modeString(type, mode)).toBe(expected);
  });
});
