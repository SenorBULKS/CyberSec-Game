import { ERRORS } from '../../fs/FileSystem';
import { canAccess } from '../../fs/permissions';
import type { Command } from '../types';

export const cat: Command = {
  name: 'cat',
  summary: 'Show what is inside a file ("concatenate")',
  run({ args, out, err, session }) {
    let status = 0;
    for (const arg of args) {
      const found = session.lookup(arg);
      if (!found.ok) {
        err(`cat: ${arg}: ${ERRORS[found.code]}\n`);
        status = 1;
      } else if (!canAccess(found.node, session.credentials(), 'r')) {
        err(`cat: ${arg}: ${ERRORS.EACCES}\n`);
        status = 1;
      } else if (found.node.type === 'dir') {
        err(`cat: ${arg}: ${ERRORS.EISDIR}\n`);
        status = 1;
      } else {
        out(found.node.content);
        session.emit({ type: 'read', path: session.resolve(arg), user: session.user });
      }
    }
    return status;
  },
};
