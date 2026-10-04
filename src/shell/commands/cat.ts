import { ERRORS } from '../../fs/FileSystem';
import type { Command } from '../types';

export const cat: Command = {
  name: 'cat',
  summary: 'Show what is inside a file ("concatenate")',
  run({ args, out, err, session }) {
    let status = 0;
    for (const arg of args) {
      const found = session.fs.lookup(session.resolve(arg));
      if (!found.ok) {
        err(`cat: ${arg}: ${ERRORS[found.code]}\n`);
        status = 1;
      } else if (found.node.type === 'dir') {
        err(`cat: ${arg}: ${ERRORS.EISDIR}\n`);
        status = 1;
      } else {
        out(found.node.content);
      }
    }
    return status;
  },
};
