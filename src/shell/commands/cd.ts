import { ERRORS } from '../../fs/FileSystem';
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
      out(target + '\n');
    }

    const path = session.resolve(target);
    const found = session.fs.lookup(path);
    if (!found.ok) {
      err(`bash: cd: ${target}: ${ERRORS[found.code]}\n`);
      return 1;
    }
    if (found.node.type !== 'dir') {
      err(`bash: cd: ${target}: ${ERRORS.ENOTDIR}\n`);
      return 1;
    }

    session.oldpwd = session.cwd;
    session.cwd = path;
    return 0;
  },
};
