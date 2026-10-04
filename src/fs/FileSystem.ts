import { basename, dirname, splitPath } from './path';
import { canAccess, type Credentials } from './permissions';

export interface Meta {
  owner: string;
  group: string;
  /** Permission bits, e.g. 0o755. */
  mode: number;
  mtime: Date;
}

export interface FileNode extends Meta {
  type: 'file';
  content: string;
}

export interface DirNode extends Meta {
  type: 'dir';
  children: Map<string, FsNode>;
}

export type FsNode = FileNode | DirNode;

/** Linux error names, with the message text the real tools print. */
export const ERRORS = {
  ENOENT: 'No such file or directory',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  EACCES: 'Permission denied',
} as const;

export type FsErrorCode = keyof typeof ERRORS;

export type LookupResult = { ok: true; node: FsNode } | { ok: false; code: FsErrorCode };

/** All game files share one plausible timestamp unless a challenge sets its own. */
export const DEFAULT_MTIME = new Date('2026-09-28T09:14:00');

const DEFAULT_META = { owner: 'root', group: 'root', mtime: DEFAULT_MTIME };

/** An in-memory Linux directory tree. */
export class FileSystem {
  readonly root: DirNode = { type: 'dir', children: new Map(), mode: 0o755, ...DEFAULT_META };

  /** Finds the node at an absolute, normalized path. */
  lookup(path: string): LookupResult {
    let node: FsNode = this.root;
    for (const name of splitPath(path)) {
      if (node.type !== 'dir') return { ok: false, code: 'ENOTDIR' };
      const child: FsNode | undefined = node.children.get(name);
      if (!child) return { ok: false, code: 'ENOENT' };
      node = child;
    }
    return { ok: true, node };
  }

  /**
   * Finds a node the way the kernel does for a user: every directory passed
   * through on the way needs execute (x) permission, or the answer is EACCES.
   */
  lookupAs(path: string, who: Credentials): LookupResult {
    let node: FsNode = this.root;
    for (const name of splitPath(path)) {
      if (node.type !== 'dir') return { ok: false, code: 'ENOTDIR' };
      if (!canAccess(node, who, 'x')) return { ok: false, code: 'EACCES' };
      const child: FsNode | undefined = node.children.get(name);
      if (!child) return { ok: false, code: 'ENOENT' };
      node = child;
    }
    return { ok: true, node };
  }

  /** Creates a directory and any missing parents. Existing directories are left as they are. */
  mkdir(path: string, meta: Partial<Meta> = {}): DirNode {
    let node: DirNode = this.root;
    for (const name of splitPath(path)) {
      let child = node.children.get(name);
      if (!child) {
        child = { type: 'dir', children: new Map(), mode: 0o755, ...DEFAULT_META, ...meta };
        node.children.set(name, child);
      }
      if (child.type !== 'dir') throw new Error(`mkdir: ${path}: a parent is a file`);
      node = child;
    }
    return node;
  }

  /** Creates or replaces a file; the parent directory must exist. */
  writeFile(path: string, content: string, meta: Partial<Meta> = {}): FileNode {
    const parent = this.lookup(dirname(path));
    if (!parent.ok || parent.node.type !== 'dir') throw new Error(`writeFile: ${path}: no parent directory`);
    const file: FileNode = { type: 'file', content, mode: 0o644, ...DEFAULT_META, ...meta };
    parent.node.children.set(basename(path), file);
    return file;
  }

  /** Removes the node at a path from its parent directory. Returns false if it was not there. */
  remove(path: string): boolean {
    const parent = this.lookup(dirname(path));
    if (!parent.ok || parent.node.type !== 'dir') return false;
    return parent.node.children.delete(basename(path));
  }
}
