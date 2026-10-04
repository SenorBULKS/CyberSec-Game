import type { Command } from '../types';

/** How long su waits after a wrong password before saying so (PAM's fail delay). */
export const SU_FAIL_DELAY_MS = 2000;

export const su: Command = {
  name: 'su',
  summary: 'Become another user, if you know their password ("switch user")',
  run({ args, err, askInput, session }) {
    let login = false;
    const names: string[] = [];
    for (const arg of args) {
      if (arg === '-' || arg === '-l' || arg === '--login') login = true;
      else if (arg.startsWith('-')) {
        err(`su: invalid option -- '${arg.replace(/^-+/, '')[0]}'\nTry 'su --help' for more information.\n`);
        return 1;
      } else names.push(arg);
    }
    const target = names[0] ?? 'root';
    const account = session.machine.account(target);
    if (!account) {
      err(`su: user ${target} does not exist or the user entry does not contain all the required fields\n`);
      return 1;
    }

    // root needs no password; everyone else must prove they know it.
    if (session.credentials().uid === 0) {
      session.switchUser(target, { login });
      return 0;
    }

    askInput({
      prompt: 'Password: ',
      secret: true,
      onInput(password, io) {
        if (account.password === undefined || password !== account.password) {
          io.delay(SU_FAIL_DELAY_MS);
          io.err('su: Authentication failure\n');
          return 1;
        }
        session.switchUser(target, { login });
        return 0;
      },
    });
    return 0;
  },
};

export const exit: Command = {
  name: 'exit',
  summary: 'Leave a shell you started with su',
  run({ out, session }) {
    out('exit\n');
    if (!session.exitUser()) {
      out('\x1b[2m(This is your own login session, so there is nothing to exit back to.)\x1b[0m\n');
    }
    return 0;
  },
};
