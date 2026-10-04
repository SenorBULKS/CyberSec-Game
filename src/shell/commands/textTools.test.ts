import { describe, expect, it } from 'vitest';
import { Machine } from '../../system/Machine';
import { Shell } from '../Shell';

function shellWithLog(content: string): Shell {
  const machine = new Machine('harborline');
  machine.addUser({ name: 'newhire', uid: 1001 });
  machine.fs.writeFile('/home/newhire/log.txt', content, { owner: 'newhire', group: 'newhire' });
  return new Shell({ machine, user: 'newhire' });
}

const LOG = 'ERROR disk full\nok so far\nerror retry\nINFO done\n';

describe('grep', () => {
  it('prints only the matching lines, case-sensitive by default', () => {
    expect(shellWithLog(LOG).execute('grep error log.txt').output).toBe('error retry\n');
  });

  it('-i ignores case', () => {
    expect(shellWithLog(LOG).execute('grep -i error log.txt').output).toBe('ERROR disk full\nerror retry\n');
  });

  it('-n adds line numbers', () => {
    expect(shellWithLog(LOG).execute('grep -n retry log.txt').output).toBe('3:error retry\n');
  });

  it('-v prints the lines that do not match', () => {
    expect(shellWithLog(LOG).execute('grep -v o log.txt').output).toBe('ERROR disk full\n');
  });

  it('-c counts the matches', () => {
    expect(shellWithLog(LOG).execute('grep -i -c error log.txt').output).toBe('2\n');
  });

  it('reads from a pipe when given no file', () => {
    expect(shellWithLog(LOG).execute('cat log.txt | grep INFO').output).toBe('INFO done\n');
  });

  it('exits 1 when nothing matches', () => {
    expect(shellWithLog(LOG).execute('grep nothing log.txt').exitCode).toBe(1);
  });

  it('exits 2 and reports a file it cannot read', () => {
    const r = shellWithLog(LOG).execute('grep x /etc/shadow');
    expect(r.output).toContain('grep: /etc/shadow: Permission denied');
    expect(r.exitCode).toBe(2);
  });
});

describe('head and tail', () => {
  it('head shows the first N lines', () => {
    expect(shellWithLog(LOG).execute('head -n 2 log.txt').output).toBe('ERROR disk full\nok so far\n');
  });

  it('tail shows the last N lines', () => {
    expect(shellWithLog(LOG).execute('tail -n 1 log.txt').output).toBe('INFO done\n');
  });

  it('head works on piped input', () => {
    expect(shellWithLog(LOG).execute('cat log.txt | head -n 1').output).toBe('ERROR disk full\n');
  });
});

describe('wc', () => {
  it('-l counts lines', () => {
    expect(shellWithLog(LOG).execute('wc -l log.txt').output).toBe('4 log.txt\n');
  });

  it('with no flags counts lines, words and characters', () => {
    // 4 lines, 10 words, and the full length including newlines.
    expect(shellWithLog(LOG).execute('wc log.txt').output).toBe(`4 10 ${LOG.length} log.txt\n`);
  });

  it('counts piped input with no file name', () => {
    expect(shellWithLog(LOG).execute('cat log.txt | wc -l').output).toBe('4\n');
  });
});

describe('less', () => {
  it('prints the whole file', () => {
    expect(shellWithLog(LOG).execute('less log.txt').output).toBe(LOG);
  });
});
