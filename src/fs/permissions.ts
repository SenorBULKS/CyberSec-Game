import type { Meta } from './FileSystem';

/** Who is asking: a user name and every group they belong to. */
export interface Credentials {
  user: string;
  uid: number;
  groups: string[];
}

export type Access = 'r' | 'w' | 'x';

const BIT: Record<Access, number> = { r: 4, w: 2, x: 1 };

/**
 * The Linux permission check: the owner bits apply to the owner, the group
 * bits to group members, the "other" bits to everyone else. Only one set is
 * ever used. root may read and write anything, and execute anything that has
 * at least one x bit (directories can always be entered).
 */
export function canAccess(node: Meta & { type: 'file' | 'dir' }, who: Credentials, access: Access): boolean {
  if (who.uid === 0) {
    if (access !== 'x' || node.type === 'dir') return true;
    return (node.mode & 0o111) !== 0;
  }
  let shift: number;
  if (node.owner === who.user) shift = 6;
  else if (who.groups.includes(node.group)) shift = 3;
  else shift = 0;
  return ((node.mode >> shift) & BIT[access]) !== 0;
}

/** Formats permission bits the way `ls -l` does, e.g. "drwxr-xr-x" or "drwxrwxrwt". */
export function modeString(type: 'file' | 'dir', mode: number): string {
  const triplet = (bits: number, special: boolean, specialChar: string) => {
    const r = bits & 4 ? 'r' : '-';
    const w = bits & 2 ? 'w' : '-';
    let x = bits & 1 ? 'x' : '-';
    if (special) x = bits & 1 ? specialChar : specialChar.toUpperCase();
    return r + w + x;
  };
  return (
    (type === 'dir' ? 'd' : '-') +
    triplet((mode >> 6) & 7, (mode & 0o4000) !== 0, 's') +
    triplet((mode >> 3) & 7, (mode & 0o2000) !== 0, 's') +
    triplet(mode & 7, (mode & 0o1000) !== 0, 't')
  );
}
