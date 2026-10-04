import { FileSystem } from './FileSystem';

const OS_RELEASE = `PRETTY_NAME="Ubuntu 22.04.4 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.4 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
UBUNTU_CODENAME=jammy
`;

const SYSTEM_CRONTAB = `# /etc/crontab: system-wide crontab
# Unlike any other crontab you don't have to run the \`crontab'
# command to install the new version when you edit this file
# and files in /etc/cron.d. These files also have username fields.

SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# m h dom mon dow user	command
17 *	* * *	root	cd / && run-parts --report /etc/cron.hourly
25 6	* * *	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )
47 6	* * 7	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.weekly )
52 6	1 * *	root	test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.monthly )
`;

/** Stand-in bytes for program files, so `cat /usr/bin/ls` looks like a binary. */
const ELF = '\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x00>\x00\x01\x00\x00\x00';

/** Programs that exist as files on disk (shell builtins like `cd` do not). */
export const PROGRAMS = [
  'cat',
  'chmod',
  'chown',
  'clear',
  'crontab',
  'echo',
  'find',
  'grep',
  'head',
  'hostname',
  'id',
  'kill',
  'less',
  'ls',
  'ps',
  'pwd',
  'rm',
  'ss',
  'stat',
  'su',
  'sudo',
  'tail',
  'wc',
  'whoami',
];

/**
 * The Ubuntu 22.04 skeleton every challenge starts from: standard top-level
 * directories with their real owners and modes, plus a few system files.
 */
export function createBaseSystem(hostname: string): FileSystem {
  const fs = new FileSystem();
  for (const dir of ['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'media', 'mnt', 'opt', 'proc', 'run', 'srv', 'sys', 'usr', 'var']) {
    fs.mkdir('/' + dir);
  }
  fs.mkdir('/root', { mode: 0o700 });
  fs.mkdir('/tmp', { mode: 0o1777 });
  fs.mkdir('/usr/bin');
  fs.mkdir('/usr/sbin');
  fs.mkdir('/usr/share');
  fs.mkdir('/var/log', { mode: 0o775, group: 'syslog' });
  fs.mkdir('/var/tmp', { mode: 0o1777 });

  for (const name of PROGRAMS) fs.writeFile(`/usr/bin/${name}`, ELF, { mode: 0o755 });
  // su and sudo run as root whoever starts them (setuid), so they can check passwords.
  fs.writeFile('/usr/bin/su', ELF, { mode: 0o4755 });
  fs.writeFile('/usr/bin/sudo', ELF, { mode: 0o4755 });

  fs.writeFile('/etc/hostname', `${hostname}\n`);
  fs.writeFile('/etc/os-release', OS_RELEASE);
  fs.writeFile('/etc/issue', 'Ubuntu 22.04.4 LTS \\n \\l\n\n');

  // Cron: the system crontab and drop-in directories (world-readable), plus the
  // per-user spool where `crontab` keeps personal jobs (only its owner may read).
  for (const dir of ['cron.d', 'cron.daily', 'cron.hourly', 'cron.weekly', 'cron.monthly']) {
    fs.mkdir('/etc/' + dir);
  }
  fs.writeFile('/etc/crontab', SYSTEM_CRONTAB);
  fs.mkdir('/var/spool');
  fs.mkdir('/var/spool/cron');
  fs.mkdir('/var/spool/cron/crontabs', { group: 'crontab', mode: 0o1730 });
  return fs;
}
