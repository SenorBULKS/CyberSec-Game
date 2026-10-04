import { createBaseSystem } from '../fs/baseSystem';
import { Shell } from '../shell/Shell';

/**
 * A small practice world used until the challenge engine arrives:
 * a home directory with a couple of files to explore.
 */
export function createSandboxShell(): Shell {
  const fs = createBaseSystem('harborline');
  const own = { owner: 'newhire', group: 'newhire' };
  fs.mkdir('/home/newhire', { ...own, mode: 0o750 });
  fs.mkdir('/home/newhire/projects', own);
  fs.writeFile(
    '/home/newhire/welcome.txt',
    'Welcome aboard!\n\nThis is your home directory. Try `ls` to see what is here,\n' +
      '`cd projects` to go into a folder, and `cat` to read a file.\n',
    own,
  );
  fs.writeFile('/home/newhire/projects/todo.txt', '1. Learn to move around the server\n2. Read the handover notes\n', own);
  return new Shell({ fs });
}
