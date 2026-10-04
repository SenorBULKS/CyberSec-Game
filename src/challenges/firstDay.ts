import {
  becameUser,
  deniedAt,
  listedDir,
  ranCommand,
  readFile,
  submittedAnswer,
  type Challenge,
  type ChallengeSetup,
} from '../game/challenge';
import { Machine } from '../system/Machine';

/** Marcus's password. He also used it for the tracking database, which is how it leaked. */
const MARCUS_PASSWORD = 'Tidewater#22';
const HANDOVER_CODE = 'HARBOR-7741';

const WELCOME = `Hi, and welcome to Harborline!

As you know, Marcus Walker left us last Friday. He looked after this
server for six years, and he wrote handover notes for whoever came next.
The trouble is that he saved them in a private folder in his own
account, and nobody else knows his password.

Your first job: get into Marcus's account and recover those notes. The
notes start with a handover code. Send it to me so I know you have them.

Sam from the network team is around if you need help.

Dana Ortiz
Operations Manager
`;

// Marcus's shell history: a few weeks of routine admin work, with one slip.
const HISTORY = `ls
cd /var/www/tracking
git pull
sudo systemctl restart tracking
sudo systemctl status tracking
cd ~
df -h
du -sh /var/log/*
sudo journalctl -u tracking --since today
mysql -u tracking_admin -p${MARCUS_PASSWORD} tracking
ls -l /var/backups
sudo tail -n 50 /var/log/syslog
free -m
uptime
cd private
nano handover.txt
ls -l
cd ~
sudo apt update
sudo apt upgrade
exit
`;

const HANDOVER = `HANDOVER NOTES - harborline
Written by Marcus Walker

Handover code: ${HANDOVER_CODE}

Whoever reads this: welcome, and sorry for the mess.

1. The parcel tracking site lives in /var/www/tracking. Deploy with
   git pull, then restart the "tracking" service.
2. Backups run every night at 02:00 to /var/backups. Check them weekly.
3. The web certificate renews itself. If the site ever shows a
   certificate warning, that renewal failed.
4. The tracking database user is tracking_admin. Please give it its
   own password; it still shares mine.
5. Change my account password, or better, lock my account. I am not
   coming back for it.

Good luck.
Marcus
`;

function setup(): ChallengeSetup {
  const machine = new Machine('harborline');
  machine.addUser({
    name: 'mwalker',
    uid: 1000,
    gecos: 'Marcus Walker',
    password: MARCUS_PASSWORD,
    groups: ['sudo'],
    // Years ago Marcus ran `chmod -R o+rX ~` to share his scripts, opening everything.
    homeMode: 0o755,
  });
  machine.addUser({ name: 'dortiz', uid: 1002, gecos: 'Dana Ortiz', password: 'not-in-this-game' });
  machine.addUser({ name: 'newhire', uid: 1001, gecos: 'New Hire' });

  const fs = machine.fs;
  const day = (date: string) => new Date(`${date}T00:00:00`);

  const me = { owner: 'newhire', group: 'newhire', mtime: day('2026-10-01') };
  fs.writeFile('/home/newhire/welcome.txt', WELCOME, { ...me, mtime: new Date('2026-10-01T17:42:00') });
  fs.writeFile('/home/newhire/.bashrc', '# Settings for interactive bash shells.\n', me);
  fs.writeFile('/home/newhire/.profile', '# Settings for login shells.\n', me);

  const marcus = { owner: 'mwalker', group: 'mwalker' };
  fs.writeFile('/home/mwalker/.bashrc', '# Settings for interactive bash shells.\n', {
    ...marcus,
    mtime: day('2020-03-11'),
  });
  fs.writeFile('/home/mwalker/.profile', '# Settings for login shells.\n', { ...marcus, mtime: day('2020-03-11') });
  // bash creates its history file as 600, but that chmod made it 644, and with
  // Ubuntu's histappend setting bash keeps appending without resetting the mode.
  fs.writeFile('/home/mwalker/.bash_history', HISTORY, {
    ...marcus,
    mode: 0o644,
    mtime: new Date('2026-09-25T18:03:00'),
  });
  fs.mkdir('/home/mwalker/scripts', { ...marcus, mtime: day('2024-06-02') });
  fs.writeFile(
    '/home/mwalker/scripts/check-disk.sh',
    '#!/bin/bash\n# Warn when the main disk is more than 90% full.\ndf -h / | awk \'NR==2 && $5+0 > 90 { print "Disk almost full: " $5 }\'\n',
    { ...marcus, mode: 0o755, mtime: day('2024-06-02') },
  );
  fs.mkdir('/home/mwalker/private', { ...marcus, mode: 0o700, mtime: new Date('2026-09-25T17:58:00') });
  fs.writeFile('/home/mwalker/private/handover.txt', HANDOVER, {
    ...marcus,
    mode: 0o600,
    mtime: new Date('2026-09-25T17:58:00'),
  });

  return { machine, user: 'newhire' };
}

export const firstDay: Challenge = {
  id: 'first-day',
  title: 'First Day on the Box',
  summary:
    'Your first day as a junior sysadmin. The last admin left without handing over his password. Find a way into his account.',
  level: 'Beginner',
  setup,
  motd:
    'Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-119-generic x86_64)\n\n' +
    'Harborline Logistics. Authorised staff only.\n\n' +
    'Last login: Thu Oct  1 17:45:12 2026 from 10.20.0.31\n',
  briefing:
    'You are the new junior system administrator at Harborline Logistics, a shipping company. ' +
    'Marcus Walker, who ran this [[server]] for six years, has left. His handover notes are locked in his account, ' +
    'and nobody knows his [[password]]. Your manager, Dana, wants them today.',
  mentor: { name: 'Sam', role: 'Network team' },
  objectives: [
    {
      id: 'whoami',
      title: 'Find out which user you are logged in as',
      intro:
        'Hi, I\'m Sam. Dana asked me to help you settle in. The dark window on the left is a [[terminal]]: you type a [[command]], press Enter, and the [[server]] answers. First things first: `whoami` tells you which [[user]] you are logged in as.',
      outro: 'You are `newhire`. Every file on this server belongs to a user, and that decides what you may open.',
      hints: [
        'There is a command whose name asks the question "who am I?"',
        'Type `whoami` and press Enter.',
        'Run: whoami',
      ],
      completeWhen: ranCommand('whoami'),
    },
    {
      id: 'pwd',
      title: 'Find out which directory you are in',
      intro:
        'Next, where are you? `pwd` prints the [[directory]] you are standing in. The same thing shows in the [[prompt]], where `~` is short for your [[home directory]].',
      outro: 'You are in `/home/newhire`, your home directory.',
      hints: ['The command stands for "print working directory".', 'Type `pwd` and press Enter.', 'Run: pwd'],
      completeWhen: ranCommand('pwd'),
    },
    {
      id: 'ls-home',
      title: 'List the files in your home directory',
      intro: 'Now look around. `ls` lists what is in the directory you are in.',
      outro: 'One file: `welcome.txt`. That will be from Dana.',
      hints: ['Which command lists files?', 'Type `ls` and press Enter.', 'Run: ls'],
      completeWhen: listedDir('/home/newhire'),
    },
    {
      id: 'welcome',
      title: 'Read the welcome note',
      intro: '`cat` prints what is inside a file. Put the file name after it, with a space between.',
      outro:
        'So that\'s the job. Marcus\'s files will be in his home directory. All home directories live together in `/home`.',
      hints: [
        'Which command shows what is inside a file?',
        'Use `cat` followed by the file name.',
        'Run: cat welcome.txt',
      ],
      completeWhen: readFile('/home/newhire/welcome.txt'),
    },
    {
      id: 'list-homes',
      title: 'See whose home directories are in /home',
      intro:
        'You can give `ls` a [[path]] to list somewhere else: `ls /home`. Or move there first with `cd /home`, then run `ls`.',
      outro:
        'Three users: you, Dana (`dortiz`), and Marcus (`mwalker`). Go into `mwalker` with `cd` and see what he left behind.',
      hints: [
        'Give `ls` the path of the directory you want to list.',
        'Try `ls /home`, or `cd /home` then `ls`.',
        'Run: ls /home',
      ],
      completeWhen: listedDir('/home'),
    },
    {
      id: 'try-private',
      title: "Try to open Marcus's private folder",
      intro:
        'Use `cd` to get into Marcus\'s directory and `ls` to look around. The notes are probably in a folder with an obvious name. Try to open it.',
      outro:
        '`Permission denied`. The server checked who you are, and only Marcus may open `private`. Those are [[permissions]] doing their job. But notice that the rest of his home directory let you in.',
      hints: [
        "Marcus's home directory is `/home/mwalker`. Look inside it for a folder that sounds secret.",
        'Go there with `cd /home/mwalker`, list it with `ls`, then try `cd private` or `ls private`.',
        'Run: ls /home/mwalker/private',
      ],
      completeWhen: deniedAt('/home/mwalker/private'),
    },
    {
      id: 'hidden',
      title: "List all files in Marcus's home, including hidden ones",
      intro:
        'Here is a trick: plain `ls` skips any file whose name starts with a dot. They are called [[hidden file|hidden files]]. Add `-a` (for "all") to see them.',
      outro:
        'Look at `.bash_history`. Linux keeps a record of the commands each person types: their [[shell history]]. That one is Marcus\'s.',
      hints: [
        '`ls` has an option that shows every file, hidden ones included.',
        'Run `ls -a` while you are in `/home/mwalker`.',
        'Run: ls -a /home/mwalker',
      ],
      completeWhen: listedDir('/home/mwalker', { all: true }),
    },
    {
      id: 'history',
      title: "Read Marcus's shell history",
      intro:
        'If his history is readable, you can see every command Marcus ran. Read it and look for anything that should never have been typed into a command.',
      outro:
        'There: `mysql -u tracking_admin -pTidewater#22`. Marcus logged in to a [[database]] and typed its password straight into the command, so it was saved in his history. People often use one password everywhere. Maybe his account uses it too.',
      hints: [
        'The file is `.bash_history` in Marcus\'s home directory. Remember the dot.',
        'Use `cat` on it, with the dot at the start of the name.',
        'Run: cat /home/mwalker/.bash_history',
      ],
      completeWhen: readFile('/home/mwalker/.bash_history'),
    },
    {
      id: 'su',
      title: 'Log in as Marcus',
      intro:
        '`su` ("switch user") lets you become another user if you know their password. Type `su mwalker`, then the password when asked. Nothing appears while you type it; that is normal, the terminal hides passwords.',
      outro:
        'You\'re in. The prompt now starts with `mwalker`: the server thinks you are Marcus, so his private folder will open for you. That is [[password reuse]] at work.',
      hints: [
        'The command to switch user is two letters long.',
        'Run `su mwalker`, then type the password from his history and press Enter.',
        'Run: su mwalker   (password: Tidewater#22)',
      ],
      completeWhen: becameUser('mwalker'),
    },
    {
      id: 'handover',
      title: 'Read the handover notes',
      intro: 'Now open Marcus\'s `private` folder and read what is inside.',
      outro: 'There is the handover code, right at the top.',
      hints: [
        'The notes are in `/home/mwalker/private`.',
        'List the folder with `ls`, then read the file with `cat`.',
        'Run: cat /home/mwalker/private/handover.txt',
      ],
      completeWhen: readFile('/home/mwalker/private/handover.txt', 'mwalker'),
    },
    {
      id: 'submit',
      title: 'Submit the handover code',
      intro: 'Send Dana the code: type `submit` followed by it.',
      hints: [
        'The code is at the top of the handover notes.',
        'Use `submit` followed by the code.',
        `Run: submit ${HANDOVER_CODE}`,
      ],
      completeWhen: submittedAnswer,
    },
  ],
  debrief: {
    summary:
      'You got into another person\'s account without breaking anything, using only `ls`, `cat` and a password he left lying around. Real intrusions often start exactly this way.',
    sections: [
      {
        title: 'Hidden is not secret',
        text: 'A dot at the start of a name only keeps a file out of a plain `ls`. Anyone the [[permissions]] allow can still read it. `ls -a` is one of the first commands an attacker runs.',
      },
      {
        title: 'Shell history leaks passwords',
        text: 'Marcus typed a password as part of a command, so bash saved it in `~/.bash_history`. Reading other users\' history files is a standard first step after breaking into a machine. Let tools ask for the password instead: `mysql -p` with nothing after it prompts for it, hidden.',
      },
      {
        title: 'Permissions only protect what they cover',
        text: 'Marcus locked `private` (only he could open it), but years earlier he had opened his whole home directory to everyone to share a script, and that included his history file. Run `ls -l /home` and compare `mwalker` with `dortiz`. `chmod 700 ~` would have closed the whole directory to everyone but him.',
      },
      {
        title: 'One leaked password opened everything',
        text: 'The database password was also Marcus\'s login password. That is [[password reuse]]: one leak, every door. Use a different password for each account, and a password manager to remember them.',
      },
      {
        title: 'What a sysadmin does next',
        text: 'Lock Marcus\'s account, give the database its own new password, clear the leaked line from his history, and tighten his home directory. Changing a leaked password matters more than finding out who saw it.',
      },
    ],
  },
  answer: HANDOVER_CODE,
};
