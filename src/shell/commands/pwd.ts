import type { Command } from '../types';

export const pwd: Command = {
  name: 'pwd',
  summary: 'Show which directory you are in ("print working directory")',
  run({ out, session }) {
    out(session.cwd + '\n');
    return 0;
  },
};
