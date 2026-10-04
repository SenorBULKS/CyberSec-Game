import type { Challenge, ChallengeSetup } from '../game/challenge';
import { Shell } from '../shell/Shell';
import { Machine } from '../system/Machine';

/**
 * A free-play world with no objectives: a home directory to explore, plus a
 * colleague whose files show permissions at work. Open it with #sandbox.
 * Tests use it as a known, stable world.
 */
function setup(): ChallengeSetup {
  const machine = new Machine('harborline');
  machine.addUser({
    name: 'mwalker',
    uid: 1000,
    gecos: 'Marcus Walker',
    password: 'letmein',
    groups: ['sudo'],
    homeMode: 0o755,
  });
  machine.addUser({ name: 'newhire', uid: 1001 });

  const fs = machine.fs;
  const me = { owner: 'newhire', group: 'newhire' };
  fs.mkdir('/home/newhire/projects', me);
  fs.writeFile(
    '/home/newhire/welcome.txt',
    'Welcome aboard!\n\nThis is your home directory. Try `ls` to see what is here,\n' +
      '`cd projects` to go into a folder, and `cat` to read a file.\n',
    me,
  );
  fs.writeFile('/home/newhire/projects/todo.txt', '1. Learn to move around the server\n2. Read the handover notes\n', me);
  fs.writeFile('/home/newhire/.bashrc', '# ~/.bashrc: executed by bash(1) for non-login shells.\n', me);

  const marcus = { owner: 'mwalker', group: 'mwalker' };
  fs.mkdir('/home/mwalker/private', { ...marcus, mode: 0o700 });
  fs.writeFile('/home/mwalker/private/notes.txt', 'Only Marcus can read this.\n', { ...marcus, mode: 0o600 });
  fs.writeFile('/home/mwalker/.profile', '# ~/.profile: executed by the command interpreter for login shells.\n', marcus);

  return { machine, user: 'newhire' };
}

export const sandbox: Challenge = {
  id: 'sandbox',
  title: 'Sandbox',
  setup,
  motd:
    'Welcome to the Harborline Logistics server.\n' +
    'Type \x1b[1mhelp\x1b[0m and press Enter to see what you can do.\n\n',
  briefing: 'Free play: explore the server. Marcus\'s practice password is letmein.',
  mentor: { name: 'Sam', role: 'Network team' },
  objectives: [],
  answer: '',
};

/** A plain shell on the sandbox world, for tests. */
export function createSandboxShell(): Shell {
  const { machine, user } = setup();
  return new Shell({ machine, user });
}
