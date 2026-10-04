import { describe, expect, it } from 'vitest';
import { basename, dirname, resolvePath, tildify } from './path';

const HOME = '/home/newhire';

describe('resolvePath', () => {
  it.each([
    ['/etc', '/etc'],
    ['/etc/', '/etc'],
    ['//etc///hostname', '/etc/hostname'],
    ['docs', '/home/newhire/docs'],
    ['./docs/../docs/.', '/home/newhire/docs'],
    ['..', '/home'],
    ['../..', '/'],
    ['../../../..', '/'],
    ['~', HOME],
    ['~/notes.txt', '/home/newhire/notes.txt'],
    ['/', '/'],
    ['.', HOME],
  ])('%s -> %s', (input, expected) => {
    expect(resolvePath(HOME, input, HOME)).toBe(expected);
  });

  it('only expands a leading ~', () => {
    expect(resolvePath('/tmp', 'a~/b', HOME)).toBe('/tmp/a~/b');
    expect(resolvePath('/tmp', '~other', HOME)).toBe('/tmp/~other');
  });
});

describe('path helpers', () => {
  it('splits into directory and name', () => {
    expect(dirname('/home/newhire/notes.txt')).toBe('/home/newhire');
    expect(dirname('/etc')).toBe('/');
    expect(basename('/home/newhire/notes.txt')).toBe('notes.txt');
    expect(basename('/')).toBe('/');
  });

  it('shows the home directory as ~ in the prompt', () => {
    expect(tildify(HOME, HOME)).toBe('~');
    expect(tildify('/home/newhire/docs', HOME)).toBe('~/docs');
    expect(tildify('/home/newhire2', HOME)).toBe('/home/newhire2');
    expect(tildify('/etc', HOME)).toBe('/etc');
  });
});
