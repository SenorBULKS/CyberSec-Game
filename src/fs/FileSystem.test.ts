import { describe, expect, it } from 'vitest';
import { FileSystem } from './FileSystem';

describe('FileSystem', () => {
  it('creates nested directories and files and finds them again', () => {
    const fs = new FileSystem();
    fs.mkdir('/home/a/docs');
    fs.writeFile('/home/a/docs/x.txt', 'hello\n', { owner: 'a', mode: 0o600 });
    const found = fs.lookup('/home/a/docs/x.txt');
    expect(found.ok && found.node.type === 'file' && found.node.content).toBe('hello\n');
    expect(found.ok && found.node.owner).toBe('a');
    expect(found.ok && found.node.mode).toBe(0o600);
  });

  it('reports ENOENT for missing paths and ENOTDIR when walking through a file', () => {
    const fs = new FileSystem();
    fs.mkdir('/etc');
    fs.writeFile('/etc/hostname', 'box\n');
    expect(fs.lookup('/etc/nope')).toEqual({ ok: false, code: 'ENOENT' });
    expect(fs.lookup('/etc/hostname/x')).toEqual({ ok: false, code: 'ENOTDIR' });
  });

  it('leaves an existing directory unchanged on mkdir', () => {
    const fs = new FileSystem();
    fs.mkdir('/srv', { owner: 'web' });
    fs.mkdir('/srv/site');
    const found = fs.lookup('/srv');
    expect(found.ok && found.node.owner).toBe('web');
  });

  it('refuses to write a file into a missing directory', () => {
    expect(() => new FileSystem().writeFile('/nope/x', '')).toThrow();
  });
});
