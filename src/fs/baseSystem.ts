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

/** Stand-in bytes for program files, so `cat /usr/bin/ls` looks like a binary. */
const ELF = '\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x00>\x00\x01\x00\x00\x00';

/** Programs that exist as files on disk (shell builtins like `cd` do not). */
export const PROGRAMS = [
  'cat',
  'clear',
  'echo',
  'grep',
  'head',
  'hostname',
  'id',
  'less',
  'ls',
  'pwd',
  'su',
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
  // su runs as root whoever starts it (setuid), so it can check any user's password.
  fs.writeFile('/usr/bin/su', ELF, { mode: 0o4755 });

  fs.writeFile('/etc/hostname', `${hostname}\n`);
  fs.writeFile('/etc/os-release', OS_RELEASE);
  fs.writeFile('/etc/issue', 'Ubuntu 22.04.4 LTS \\n \\l\n\n');
  return fs;
}
