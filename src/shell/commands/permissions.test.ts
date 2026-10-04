import { describe, expect, it } from 'vitest';
import { createSandboxShell } from '../../challenges/sandbox';

// Expected outputs come from GNU coreutils 9.4 run as a real `newhire` user
// on an identical tree (same owners, modes, sizes and timestamps).
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const run = (line: string, sh = createSandboxShell()) => {
  const r = sh.execute(line, { columns: 80 });
  return { ...r, output: strip(r.output) };
};

describe('ls -l and -a', () => {
  it('long-lists the home directory with a total line', () => {
    expect(run('ls -l').output).toBe(
      'total 8\n' +
        'drwxr-xr-x 2 newhire newhire 4096 Sep 28 09:14 projects\n' +
        '-rw-r--r-- 1 newhire newhire  137 Sep 28 09:14 welcome.txt\n',
    );
  });

  it('shows hidden files and . and .. with -la', () => {
    expect(run('ls -la').output).toBe(
      'total 20\n' +
        'drwxr-x--- 3 newhire newhire 4096 Sep 28 09:14 .\n' +
        'drwxr-xr-x 4 root    root    4096 Sep 28 09:14 ..\n' +
        '-rw-r--r-- 1 newhire newhire   55 Sep 28 09:14 .bashrc\n' +
        'drwxr-xr-x 2 newhire newhire 4096 Sep 28 09:14 projects\n' +
        '-rw-r--r-- 1 newhire newhire  137 Sep 28 09:14 welcome.txt\n',
    );
  });

  it('accepts the flags separately and in any order', () => {
    expect(run('ls -a -l').output).toBe(run('ls -al').output);
    expect(run('ls --all -l').output).toBe(run('ls -la').output);
  });

  it('shows hidden files in columns with -a, and without . and .. using -A', () => {
    expect(run('ls -a').output).toBe('.  ..  .bashrc  projects  welcome.txt\n');
    expect(run('ls -A').output).toBe('.bashrc  projects  welcome.txt\n');
  });

  it('shows human-readable sizes with -h', () => {
    expect(run('ls -lh').output).toBe(
      'total 8.0K\n' +
        'drwxr-xr-x 2 newhire newhire 4.0K Sep 28 09:14 projects\n' +
        '-rw-r--r-- 1 newhire newhire  137 Sep 28 09:14 welcome.txt\n',
    );
  });

  it('describes a directory itself with -d', () => {
    expect(run('ls -ld .').output).toBe('drwxr-x--- 3 newhire newhire 4096 Sep 28 09:14 .\n');
  });

  it("lists another user's readable home, showing the locked private folder", () => {
    expect(run('ls -la ../mwalker').output).toBe(
      'total 16\n' +
        'drwxr-xr-x 3 mwalker mwalker 4096 Sep 28 09:14 .\n' +
        'drwxr-xr-x 4 root    root    4096 Sep 28 09:14 ..\n' +
        '-rw-r--r-- 1 mwalker mwalker   68 Sep 28 09:14 .profile\n' +
        'drwx------ 2 mwalker mwalker 4096 Sep 28 09:14 private\n',
    );
  });

  it('shows the sticky bit on /tmp', () => {
    expect(run('ls -ld /tmp').output).toBe('drwxrwxrwt 2 root root 4096 Sep 28 09:14 /tmp\n');
  });

  it('prints a file older than six months with its year', () => {
    const sh = createSandboxShell();
    sh.fs.writeFile('/tmp/old.log', 'x\n', { mtime: new Date('2025-11-03T10:00:00') });
    expect(run('ls -l /tmp/old.log', sh).output).toBe('-rw-r--r-- 1 root root 2 Nov  3  2025 /tmp/old.log\n');
  });

  it('rejects unknown options with the GNU messages', () => {
    expect(run('ls -lz').output).toBe("ls: invalid option -- 'z'\nTry 'ls --help' for more information.\n");
    expect(run('ls --bogus').output).toBe("ls: unrecognized option '--bogus'\nTry 'ls --help' for more information.\n");
  });
});

describe('permission denied', () => {
  it('refuses to list a directory without read permission', () => {
    expect(run('ls ../mwalker/private')).toMatchObject({
      output: "ls: cannot open directory '../mwalker/private': Permission denied\n",
      exitCode: 2,
    });
    expect(run('ls /root').output).toBe("ls: cannot open directory '/root': Permission denied\n");
  });

  it('refuses to enter a directory without execute permission', () => {
    const sh = createSandboxShell();
    expect(run('cd /home/mwalker/private', sh)).toMatchObject({
      output: 'bash: cd: /home/mwalker/private: Permission denied\n',
      exitCode: 1,
    });
    expect(sh.cwd).toBe('/home/newhire');
  });

  it('refuses to read a file inside a locked directory', () => {
    expect(run('cat ../mwalker/private/notes.txt')).toMatchObject({
      output: 'cat: ../mwalker/private/notes.txt: Permission denied\n',
      exitCode: 1,
    });
  });

  it('refuses to read a file without read permission', () => {
    const sh = createSandboxShell();
    sh.fs.writeFile('/tmp/secret', 'x', { owner: 'mwalker', mode: 0o600 });
    expect(run('cat /tmp/secret', sh).output).toBe('cat: /tmp/secret: Permission denied\n');
  });

  it('lists names but no details in a readable directory without execute permission', () => {
    const sh = createSandboxShell();
    sh.fs.mkdir('/home/mwalker/readonly', { owner: 'mwalker', group: 'mwalker', mode: 0o744 });
    sh.fs.writeFile('/home/mwalker/readonly/a.txt', 'hi\n', { owner: 'mwalker' });
    sh.fs.mkdir('/home/mwalker/readonly/sub', { owner: 'mwalker' });
    sh.cwd = '/home/mwalker';
    expect(run('ls readonly', sh).output).toBe('a.txt  sub\n');
    const long = run('ls -l readonly', sh);
    expect(long.output).toBe(
      "ls: cannot access 'readonly/a.txt': Permission denied\n" +
        "ls: cannot access 'readonly/sub': Permission denied\n" +
        'total 0\n' +
        '-????????? ? ? ? ?            ? a.txt\n' +
        'd????????? ? ? ? ?            ? sub\n',
    );
    expect(long.exitCode).toBe(1);
  });
});

describe('whoami, hostname and id', () => {
  it('says who and where you are', () => {
    expect(run('whoami').output).toBe('newhire\n');
    expect(run('hostname').output).toBe('harborline\n');
  });

  it('shows user and group IDs, including extra groups', () => {
    expect(run('id').output).toBe('uid=1001(newhire) gid=1001(newhire) groups=1001(newhire)\n');
    expect(run('id mwalker').output).toBe('uid=1000(mwalker) gid=1000(mwalker) groups=1000(mwalker),27(sudo)\n');
  });

  it('reports unknown users and extra operands with the coreutils messages', () => {
    expect(run('id nobodyx').output).toBe('id: ‘nobodyx’: no such user\n');
    expect(run('whoami x').output).toBe("whoami: extra operand ‘x’\nTry 'whoami --help' for more information.\n");
  });

  it('keeps /etc/passwd in step with the accounts', () => {
    const passwd = run('cat /etc/passwd').output;
    expect(passwd).toContain('mwalker:x:1000:1000:Marcus Walker:/home/mwalker:/bin/bash\n');
    expect(passwd).toContain('newhire:x:1001:1001::/home/newhire:/bin/bash\n');
    expect(passwd.startsWith('root:x:0:0:root:/root:/bin/bash\n')).toBe(true);
  });
});
