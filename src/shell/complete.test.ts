import { describe, expect, it } from 'vitest';
import { createSandboxShell } from '../challenges/sandbox';

const complete = (line: string, sh = createSandboxShell()) => sh.complete(line, line.length);

describe('Tab completion', () => {
  it('completes a unique command name and adds a space', () => {
    expect(complete('who')).toEqual({ insert: 'ami ', candidates: [] });
  });

  it('offers every command that matches an ambiguous prefix', () => {
    expect(complete('c')).toEqual({ insert: '', candidates: ['cat', 'cd', 'clear'] });
    expect(complete('h')).toEqual({ insert: '', candidates: ['help', 'hostname'] });
  });

  it('completes file names, adding / to directories', () => {
    expect(complete('cat wel')).toEqual({ insert: 'come.txt ', candidates: [] });
    expect(complete('cd pro')).toEqual({ insert: 'jects/', candidates: [] });
  });

  it('completes inside a path', () => {
    expect(complete('cat projects/t')).toEqual({ insert: 'odo.txt ', candidates: [] });
    expect(complete('ls /home/mw')).toEqual({ insert: 'alker/', candidates: [] });
    expect(complete('ls ../')).toEqual({ insert: '', candidates: ['mwalker/', 'newhire/'] });
  });

  it('hides dot files unless the word starts with a dot', () => {
    expect(complete('ls /home/mwalker/')).toEqual({ insert: 'private/', candidates: [] });
    expect(complete('cat /home/mwalker/.')).toEqual({ insert: 'profile ', candidates: [] });
  });

  it('fills in the shared part of several matches', () => {
    const sh = createSandboxShell();
    sh.fs.writeFile('/tmp/backup-1.tar', '');
    sh.fs.writeFile('/tmp/backup-2.tar', '');
    expect(complete('ls /tmp/b', sh)).toEqual({ insert: 'ackup-', candidates: ['backup-1.tar', 'backup-2.tar'] });
  });

  it('cannot see inside directories you may not read', () => {
    expect(complete('ls /home/mwalker/private/')).toEqual({ insert: '', candidates: [] });
  });

  it('escapes spaces in completed names', () => {
    const sh = createSandboxShell();
    sh.fs.writeFile('/tmp/my notes.txt', '');
    expect(complete('cat /tmp/my', sh)).toEqual({ insert: '\\ notes.txt ', candidates: [] });
    expect(complete('cat /tmp/my\\ n', sh)).toEqual({ insert: 'otes.txt ', candidates: [] });
  });
});
