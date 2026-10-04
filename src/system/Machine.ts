import { createBaseSystem } from '../fs/baseSystem';
import type { FileSystem } from '../fs/FileSystem';
import type { Credentials } from '../fs/permissions';

export interface Account {
  name: string;
  uid: number;
  gid: number;
  /** The "full name" field of /etc/passwd. */
  gecos: string;
  home: string;
  shell: string;
  /** Plain text in the simulation; a real system stores only a hash. Undefined = login disabled. */
  password?: string;
}

export interface Group {
  name: string;
  gid: number;
  members: string[];
}

export interface NewUser {
  name: string;
  uid: number;
  gecos?: string;
  password?: string;
  /** Mode of the home directory. Ubuntu 22.04 creates homes as 750. */
  homeMode?: number;
  /** Extra groups, e.g. ['sudo']. */
  groups?: string[];
}

// System accounts that exist on a fresh Ubuntu 22.04 server.
const SYSTEM_ACCOUNTS: Account[] = [
  { name: 'root', uid: 0, gid: 0, gecos: 'root', home: '/root', shell: '/bin/bash' },
  { name: 'daemon', uid: 1, gid: 1, gecos: 'daemon', home: '/usr/sbin', shell: '/usr/sbin/nologin' },
  { name: 'bin', uid: 2, gid: 2, gecos: 'bin', home: '/bin', shell: '/usr/sbin/nologin' },
  { name: 'sys', uid: 3, gid: 3, gecos: 'sys', home: '/dev', shell: '/usr/sbin/nologin' },
  { name: 'www-data', uid: 33, gid: 33, gecos: 'www-data', home: '/var/www', shell: '/usr/sbin/nologin' },
  { name: 'nobody', uid: 65534, gid: 65534, gecos: 'nobody', home: '/nonexistent', shell: '/usr/sbin/nologin' },
  { name: 'syslog', uid: 104, gid: 110, gecos: '', home: '/home/syslog', shell: '/usr/sbin/nologin' },
  { name: 'sshd', uid: 105, gid: 65534, gecos: '', home: '/run/sshd', shell: '/usr/sbin/nologin' },
];

const SYSTEM_GROUPS: Group[] = [
  { name: 'root', gid: 0, members: [] },
  { name: 'daemon', gid: 1, members: [] },
  { name: 'bin', gid: 2, members: [] },
  { name: 'sys', gid: 3, members: [] },
  { name: 'adm', gid: 4, members: ['syslog'] },
  { name: 'sudo', gid: 27, members: [] },
  { name: 'www-data', gid: 33, members: [] },
  { name: 'shadow', gid: 42, members: [] },
  { name: 'syslog', gid: 110, members: [] },
  { name: 'nogroup', gid: 65534, members: [] },
];

/** One simulated computer: its files, its user accounts and its clock. */
export class Machine {
  readonly fs: FileSystem;
  readonly accounts: Account[] = SYSTEM_ACCOUNTS.map((a) => ({ ...a }));
  readonly groupList: Group[] = SYSTEM_GROUPS.map((g) => ({ ...g, members: [...g.members] }));

  constructor(
    readonly hostname: string,
    /** The in-game "now", fixed so that `ls -l` dates are the same on every play. */
    readonly clock: Date = new Date('2026-10-02T08:30:00'),
  ) {
    this.fs = createBaseSystem(hostname);
    this.writeAccountFiles();
  }

  addUser(user: NewUser): Account {
    const account: Account = {
      name: user.name,
      uid: user.uid,
      gid: user.uid,
      gecos: user.gecos ?? '',
      home: `/home/${user.name}`,
      shell: '/bin/bash',
      password: user.password,
    };
    this.accounts.push(account);
    this.groupList.push({ name: user.name, gid: user.uid, members: [] });
    for (const extra of user.groups ?? []) this.groupList.find((g) => g.name === extra)?.members.push(user.name);
    this.fs.mkdir(account.home, { owner: user.name, group: user.name, mode: user.homeMode ?? 0o750 });
    this.writeAccountFiles();
    return account;
  }

  account(name: string): Account | undefined {
    return this.accounts.find((a) => a.name === name);
  }

  /** The groups a user belongs to: their own group first, then any extras. */
  groupsOf(name: string): Group[] {
    const account = this.account(name);
    if (!account) return [];
    const primary = this.groupList.find((g) => g.gid === account.gid);
    const extras = this.groupList.filter((g) => g !== primary && g.members.includes(name));
    return primary ? [primary, ...extras] : extras;
  }

  credentials(name: string): Credentials {
    const account = this.account(name);
    if (!account) throw new Error(`no such user: ${name}`);
    return { user: name, uid: account.uid, groups: this.groupsOf(name).map((g) => g.name) };
  }

  /** Keeps /etc/passwd, /etc/group and /etc/shadow in step with the account list, as on a real system. */
  private writeAccountFiles() {
    const passwd = this.accounts
      .map((a) => [a.name, 'x', a.uid, a.gid, a.gecos, a.home, a.shell].join(':'))
      .join('\n');
    const group = this.groupList.map((g) => [g.name, 'x', g.gid, g.members.join(',')].join(':')).join('\n');
    this.fs.writeFile('/etc/passwd', passwd + '\n');
    this.fs.writeFile('/etc/group', group + '\n');
    // Only root and the shadow group may read password hashes.
    const shadow = this.accounts.map((a) => `${a.name}:${shadowHash(a)}:20359:0:99999:7:::`).join('\n');
    this.fs.writeFile('/etc/shadow', shadow + '\n', { group: 'shadow', mode: 0o640 });
  }
}

const HASH_ALPHABET = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * A stand-in for the yescrypt hash Ubuntu stores: same shape, deterministic,
 * and impossible to turn back into the password (it is not derived from it).
 */
function shadowHash(account: Account): string {
  if (account.uid < 1000 || account.name === 'nobody') return '*';
  if (account.password === undefined) return '!';
  let seed = 0;
  for (const ch of account.name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const chars = (n: number) => {
    let out = '';
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      out += HASH_ALPHABET[seed % 64];
    }
    return out;
  };
  return `$y$j9T$${chars(22)}$${chars(43)}`;
}
