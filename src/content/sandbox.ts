import { Shell } from '../shell/Shell';
import { Machine } from '../system/Machine';

/**
 * A small practice world used until the challenge engine arrives: a home
 * directory to explore, plus a colleague whose files show permissions at work.
 */
export function createSandboxShell(): Shell {
  const machine = new Machine('harborline');
  machine.addUser({ name: 'mwalker', uid: 1000, gecos: 'Marcus Walker', groups: ['sudo'], homeMode: 0o755 });
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

  return new Shell({ machine, user: 'newhire' });
}
