import type { Command } from '../types';

export const whoami: Command = {
  name: 'whoami',
  summary: 'Show which user you are logged in as',
  run({ args, out, err, session }) {
    if (args.length > 0) {
      err(`whoami: extra operand ‘${args[0]}’\nTry 'whoami --help' for more information.\n`);
      return 1;
    }
    out(session.user + '\n');
    return 0;
  },
};

export const hostname: Command = {
  name: 'hostname',
  summary: 'Show the name of this computer',
  run({ out, session }) {
    out(session.host + '\n');
    return 0;
  },
};

export const id: Command = {
  name: 'id',
  summary: 'Show your user ID and the groups you belong to',
  run({ args, out, err, session }) {
    const name = args[0] ?? session.user;
    const account = session.machine.account(name);
    if (!account) {
      err(`id: ‘${name}’: no such user\n`);
      return 1;
    }
    const groups = session.machine.groupsOf(name);
    const primary = groups.find((g) => g.gid === account.gid);
    const list = groups.map((g) => `${g.gid}(${g.name})`).join(',');
    out(`uid=${account.uid}(${account.name}) gid=${account.gid}(${primary?.name ?? account.gid}) groups=${list}\n`);
    return 0;
  },
};
