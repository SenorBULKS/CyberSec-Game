import {
  grepped,
  listedDir,
  pipedInto,
  ranCommandWith,
  readFile,
  submittedAnswer,
  type Challenge,
  type ChallengeSetup,
} from '../game/challenge';
import { Machine } from '../system/Machine';

/** The address the overnight break-in attempts came from. */
const ATTACKER_IP = '198.51.100.66';
/** Marcus's reused password let the attacker straight in, just as it let you in on day one. */

/**
 * Builds the authentication log: a quiet evening, then a burst of SSH
 * guesses from one address overnight, one of which succeeds, then morning.
 */
function buildAuthLog(): string {
  const lines: string[] = [];
  const add = (date: string, time: string, text: string) => lines.push(`${date} ${time} harborline ${text}`);

  // Monday evening: a normal evening on the box, the day before the break-in.
  add('Oct  5', '21:17:01', 'CRON[1831]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)');
  add('Oct  5', '21:17:01', 'CRON[1831]: pam_unix(cron:session): session closed for user root');
  add('Oct  5', '22:30:11', 'sudo:   dortiz : TTY=pts/0 ; PWD=/home/dortiz ; USER=root ; COMMAND=/usr/bin/apt update');
  add('Oct  5', '22:30:11', 'sudo: pam_unix(sudo:session): session opened for user root(uid=0) by dortiz(uid=1002)');
  add('Oct  5', '22:30:19', 'sudo: pam_unix(sudo:session): session closed for user root');
  add('Oct  5', '23:01:01', 'CRON[1902]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)');
  add('Oct  5', '23:01:02', 'CRON[1902]: pam_unix(cron:session): session closed for user root');

  // Early Tuesday, 02:14 onward: an automated password-guessing run from one address.
  const guesses = [
    ['02:14:03', 'invalid user admin', '40112'],
    ['02:14:05', 'invalid user admin', '40118'],
    ['02:14:07', 'invalid user oracle', '40124'],
    ['02:14:09', 'invalid user postgres', '40131'],
    ['02:14:12', 'invalid user test', '40140'],
    ['02:14:15', 'invalid user ubuntu', '40152'],
    ['02:14:31', 'root', '40188'],
    ['02:14:34', 'root', '40194'],
    ['02:14:37', 'root', '40201'],
    ['02:14:52', 'invalid user git', '40233'],
    ['02:15:08', 'mwalker', '40355'],
    ['02:15:11', 'mwalker', '40362'],
    ['02:15:29', 'mwalker', '40480'],
  ];
  let pid = 2101;
  for (const [time, who, port] of guesses) {
    const forWho = who.startsWith('invalid user') ? who : `${who}`;
    add('Oct  6', time, `sshd[${pid}]: Failed password for ${forWho} from ${ATTACKER_IP} port ${port} ssh2`);
    pid += 3;
  }
  // The attempt that worked: Marcus's reused password, replayed from elsewhere.
  add('Oct  6', '02:15:44', `sshd[2140]: Accepted password for mwalker from ${ATTACKER_IP} port 40631 ssh2`);
  add('Oct  6', '02:15:44', 'sshd[2140]: pam_unix(sshd:session): session opened for user mwalker(uid=1000) by (uid=0)');
  add('Oct  6', '02:19:58', 'sshd[2140]: pam_unix(sshd:session): session closed for user mwalker');

  // Tuesday morning: the team logs in as usual.
  add('Oct  6', '08:02:10', 'sshd[2602]: Accepted publickey for dortiz from 10.20.0.31 port 52244 ssh2: RSA SHA256:9xP...');
  add('Oct  6', '08:02:10', 'sshd[2602]: pam_unix(sshd:session): session opened for user dortiz(uid=1002) by (uid=0)');
  add('Oct  6', '08:30:02', 'sshd[2733]: Accepted password for newhire from 10.20.0.31 port 52390 ssh2');
  add('Oct  6', '08:30:02', 'sshd[2733]: pam_unix(sshd:session): session opened for user newhire(uid=1001) by (uid=0)');
  return lines.join('\n') + '\n';
}

function setup(): ChallengeSetup {
  // It is the morning after the break-in: Tuesday, 6 Oct 2026, a few minutes
  // past the team's morning logins, and a few days after challenge 1. Every
  // log line and mtime sits before this.
  const machine = new Machine('harborline', new Date('2026-10-06T08:35:00'));
  // You have been given the admin's own groups now: adm (to read logs) and sudo.
  machine.addUser({ name: 'newhire', uid: 1001, gecos: 'New Hire', password: 'harbor2026', groups: ['adm', 'sudo'] });
  machine.addUser({ name: 'mwalker', uid: 1000, gecos: 'Marcus Walker', homeMode: 0o755 });
  machine.addUser({ name: 'dortiz', uid: 1002, gecos: 'Dana Ortiz' });

  const fs = machine.fs;
  const me = { owner: 'newhire', group: 'newhire' };
  fs.writeFile(
    '/home/newhire/task.txt',
    'From Dana:\n\n' +
      'The monitoring box emailed overnight about a lot of failed SSH logins on\n' +
      'this server. Can you look at the auth log and tell me whether anyone\n' +
      'actually got in, and which address it came from? Sam can help.\n',
    { ...me, mtime: new Date('2026-10-06T07:58:00') },
  );
  fs.writeFile('/home/newhire/.bashrc', '# ~/.bashrc\n', me);

  // The authentication log: readable by root and the adm group, as on a real server.
  fs.writeFile('/var/log/auth.log', buildAuthLog(), {
    owner: 'syslog',
    group: 'adm',
    mode: 0o640,
    mtime: new Date('2026-10-06T08:30:02'),
  });
  // A couple of other logs sit alongside it, so /var/log is worth a look.
  fs.writeFile(
    '/var/log/syslog',
    'Oct  6 00:00:01 harborline rsyslogd: rsyslogd was HUPed\n' +
      'Oct  6 08:12:33 harborline systemd[1]: Started tracking.service.\n',
    { owner: 'syslog', group: 'adm', mode: 0o640, mtime: new Date('2026-10-06T08:12:33') },
  );
  fs.writeFile('/var/log/dpkg.log', 'Oct  5 22:30:14 upgrade libc6:amd64 2.35-0ubuntu3.1 2.35-0ubuntu3.4\n', {
    owner: 'root',
    group: 'root',
    mode: 0o644,
    mtime: new Date('2026-10-05T22:30:14'),
  });

  return { machine, user: 'newhire' };
}

export const readingLogs: Challenge = {
  id: 'reading-logs',
  title: 'Reading the Logs',
  summary:
    'The monitoring system flagged a flood of failed logins overnight. Dig through the auth log to find out if anyone got in.',
  level: 'Beginner+',
  setup,
  motd:
    'Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-119-generic x86_64)\n\n' +
    'Harborline Logistics. Authorised staff only.\n\n' +
    'Last login: Mon Oct  5 17:46:03 2026 from 10.20.0.31\n',
  briefing:
    'You have settled in as the junior sysadmin at Harborline. Overnight, the [[monitoring]] system reported a flood of failed SSH logins. ' +
    'Dana wants to know whether anyone actually broke in, and from what address. The answers are in the [[log file|log files]] under `/var/log`.',
  mentor: { name: 'Sam', role: 'Network team' },
  objectives: [
    {
      id: 'read-task',
      title: 'Read the note from Dana',
      intro:
        'Morning. There is a `task.txt` in your [[home directory]] from Dana. Read it with `cat` so we both know what she is after.',
      outro: 'Right: did anyone get in overnight, and from where. That lives in the logs.',
      hints: ['Use `cat` on the file in your home directory.', 'The file is `task.txt`.', 'Run: cat task.txt'],
      completeWhen: readFile('/home/newhire/task.txt'),
    },
    {
      id: 'list-logs',
      title: 'See what logs are in /var/log',
      intro:
        'Linux writes its [[log file|logs]] into `/var/log`. List that directory to see what is there. The one that records every login attempt is `auth.log`.',
      outro:
        'There is `auth.log` (logins and SSH), `syslog` (general system messages) and a few more. We want `auth.log`. You can read it because you were added to the `adm` group, which is allowed to read the logs.',
      hints: ['Give `ls` the path `/var/log`.', 'Run `ls /var/log`.', 'Run: ls /var/log'],
      completeWhen: listedDir('/var/log'),
    },
    {
      id: 'size',
      title: 'See how big auth.log is',
      intro:
        'Before you open it, see how long it is. `wc -l` counts the lines in a file. A login log can be thousands of lines, far too many to read by eye.',
      outro: 'Dozens of lines, and a real server would have thousands. Reading it all is hopeless, so we search instead.',
      hints: [
        '`wc -l` followed by a file name counts its lines.',
        'The file is `/var/log/auth.log`.',
        'Run: wc -l /var/log/auth.log',
      ],
      completeWhen: ranCommandWith('wc', 'auth.log'),
    },
    {
      id: 'tail',
      title: 'Glance at the most recent entries',
      intro:
        '`tail` shows the last lines of a file (the newest events); `head` shows the first. Take a quick look at the end of `auth.log`.',
      outro:
        'The morning logins look normal: Dana and you, from `10.20.0.31`, the office. The interesting part is earlier, in the small hours. Searching will find it faster than scrolling.',
      hints: [
        '`tail` shows the end of a file.',
        'Run `tail /var/log/auth.log`.',
        'Run: tail /var/log/auth.log',
      ],
      completeWhen: ranCommandWith('tail', 'auth.log'),
    },
    {
      id: 'failed',
      title: 'Search for the failed logins',
      intro:
        '`grep` prints only the lines that contain the text you give it: `grep WORD FILE`. Failed SSH logins are logged as "Failed password". Search `auth.log` for them.',
      outro:
        'A wall of "Failed password", all from one address, `198.51.100.66`, in the space of a couple of minutes. That is a [[brute-force|brute-force attack]]: a machine guessing passwords over and over.',
      hints: [
        'Use `grep` with the text to look for, then the file. Quote it if it has a space.',
        'Search for "Failed password" in `/var/log/auth.log`.',
        'Run: grep "Failed password" /var/log/auth.log',
      ],
      completeWhen: grepped('Failed'),
    },
    {
      id: 'count',
      title: 'Count the failed attempts with a pipe',
      intro:
        'How many were there? A [[pipe]] (`|`) feeds one command’s output into the next. Send the matching lines from `grep` into `wc -l` to count them: `grep ... | wc -l`.',
      outro:
        'A dozen-plus failures in two minutes, by hand nobody types that fast. This was automated. The question now: did any of it work?',
      hints: [
        'Put a `|` between the `grep` and `wc -l`.',
        'Reuse your grep, then pipe it: `grep "Failed password" /var/log/auth.log | wc -l`.',
        'Run: grep "Failed password" /var/log/auth.log | wc -l',
      ],
      completeWhen: pipedInto('wc'),
    },
    {
      id: 'accepted',
      title: 'Find out whether any login succeeded',
      intro:
        'A successful SSH login is logged as "Accepted". Search `auth.log` for accepted logins and look at which ones came from that same address.',
      outro:
        'There it is: `Accepted password for mwalker from 198.51.100.66`. It worked after only a few tries, so the noisy guessing was mostly cover: the attacker already had Marcus’s password and simply used it, the [[password reuse|reused password]] you found on your first day. That is [[credential stuffing]], not guessing. The morning "Accepted" lines are the team, from the office address, so they are fine.',
      hints: [
        'Search `auth.log` for "Accepted" the same way you searched for "Failed password".',
        'Run `grep Accepted /var/log/auth.log` and read which address each came from.',
        'Run: grep Accepted /var/log/auth.log',
      ],
      completeWhen: grepped('Accepted'),
    },
    {
      id: 'submit',
      title: 'Report the attacker’s address',
      intro:
        'Dana asked which address it came from. Send it to her with `submit` followed by the IP address the break-in came from.',
      hints: [
        'It is the address on the "Failed password" and the "Accepted password for mwalker" lines.',
        'Submit the IP address, nothing else.',
        `Run: submit ${ATTACKER_IP}`,
      ],
      completeWhen: submittedAnswer,
    },
  ],
  expertObjectives: [
    {
      id: 'investigate',
      title: 'Find whether anyone logged in overnight, and from where',
      doneWhen: 'accepted',
      hints: [
        'The overnight logins are in `/var/log/auth.log`. You are in the `adm` group, so you may read it.',
        "Do not scroll it, search it. A [[brute-force]] run is a burst of `Failed password` lines from one address.",
        'Find the attempt that worked: `grep Accepted /var/log/auth.log`.',
      ],
    },
    {
      id: 'report',
      title: "Report the attacker's IP address",
      doneWhen: 'submit',
      hints: [
        "The address you want is the one on the `Accepted password` line.",
        `Run: submit ${ATTACKER_IP}`,
      ],
    },
  ],
  debrief: {
    summary:
      'You read a login log the way a responder does: you did not scroll through it, you searched it. A burst of failed logins from one address ended in a successful login to an account whose password had been reused and leaked.',
    sections: [
      {
        title: 'Logs are searched, not read',
        text: 'Real logs are far too long to read line by line. `grep` pulls out the lines that matter, and a [[pipe]] into `wc -l` or another `grep` narrows it further. Learning to ask a log the right question is most of the job.',
      },
      {
        title: 'Brute force vs. credential stuffing',
        text: 'The wall of "Failed password" lines from one address, trying common usernames (admin, oracle, root), is [[brute-force]]: a machine guessing credentials. Guessing is slow and noisy, and rate-limiting, or a tool like fail2ban that blocks an address after a few failures, defends against it. What actually got in was different: [[credential stuffing]], replaying a password already leaked from elsewhere. It needs no guessing, so it is quiet and succeeds in a try or two. The defence is different too: unique passwords per account, and keys or multi-factor login instead of passwords alone.',
      },
      {
        title: 'The break-in you already half-knew',
        text: 'The login that succeeded was `mwalker`, from the attacker’s address, using the same reused password you found on day one — still live, because in the days since nobody had forced a reset or locked the account. The attacker did not guess it; they already had it and replayed it, which is why only a handful of `mwalker` attempts show before the `Accepted` line. One leaked, reused password is how a flood of noise turns into a real intrusion. Changing or locking that account would have stopped it.',
      },
      {
        title: 'Telling attacker from colleague',
        text: 'Not every "Accepted" line is bad. The morning logins were the team, from the office address `10.20.0.31`, one of them with an SSH key rather than a password. Context, the address, the time, the method, is what separates a normal login from an intruder.',
      },
      {
        title: 'What a responder does next',
        text: 'Lock the `mwalker` account, force a password reset, and check what happened during that overnight session. That session is where the next few challenges pick up: once someone is in, what did they leave behind?',
      },
    ],
  },
  answer: ATTACKER_IP,
};
