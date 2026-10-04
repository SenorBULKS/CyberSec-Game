import { ERRORS } from '../../fs/FileSystem';
import { canAccess } from '../../fs/permissions';
import type { Command } from '../types';

export const cd: Command = {
  name: 'cd',
  summary: 'Move into another directory ("change directory")',
  run({ args, out, err, session }) {
    if (args.length > 1) {
      err('bash: cd: too many arguments\n');
      return 1;
    }

    let target = args[0] ?? session.home;
    if (target === '-') {
      if (!session.oldpwd) {
        err('bash: cd: OLDPWD not set\n');
        return 1;
      }
      target = session.oldpwd;
    }

    const found = session.lookup(target);
    if (!found.ok) {
      err(`bash: cd: ${target}: ${ERRORS[found.code]}\n`);
      return 1;
    }
    if (found.node.type !== 'dir') {
      err(`bash: cd: ${target}: ${ERRORS.ENOTDIR}\n`);
      return 1;
    }
    if (!canAccess(found.node, session.credentials(), 'x')) {
      err(`bash: cd: ${target}: ${ERRORS.EACCES}\n`);
      return 1;
    }

    if (args[0] === '-') out(target + '\n');
    session.oldpwd = session.cwd;
    session.cwd = session.resolve(target);
    session.emit({ type: 'cd', path: session.cwd, user: session.user });
    return 0;
  },
};
