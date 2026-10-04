import { describe, expect, it } from 'vitest';
import { compareNames, formatColumns } from './format';

const items = (names: string[]) => names.map((n) => ({ display: n, width: n.length }));

describe('formatColumns', () => {
  it('puts everything on one line when it fits', () => {
    expect(formatColumns(items(['bin', 'etc', 'home']), 80)).toBe('bin  etc  home\n');
  });

  it('fills columns top to bottom when the line is too narrow', () => {
    const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    expect(formatColumns(items(names), 20)).toBe('alpha    delta\nbravo    echo\ncharlie\n');
  });

  it('falls back to one per line for very long names', () => {
    expect(formatColumns(items(['a-very-long-name', 'another-long-name']), 20)).toBe(
      'a-very-long-name\nanother-long-name\n',
    );
  });

  it('pads by visible width, not by color codes', () => {
    const colored = [{ display: '\x1b[01;34mdir\x1b[0m', width: 3 }, ...items(['file'])];
    expect(formatColumns(colored, 80)).toBe('\x1b[01;34mdir\x1b[0m  file\n');
  });

  it('prints nothing for an empty list', () => {
    expect(formatColumns([], 80)).toBe('');
  });
});

describe('compareNames', () => {
  it('sorts like ls in the C.UTF-8 locale', () => {
    const names = ['Zeta', 'alpha', '.profile', 'Beta', '.bashrc', 'beta', '..', '.'];
    expect(names.sort(compareNames)).toEqual(['.', '..', '.bashrc', '.profile', 'Beta', 'Zeta', 'alpha', 'beta']);
  });
});
