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

export const sudo: Command = {
  name: 'sudo',
  summary: 'Run a command as another user, usually root (sudo <command>)',
  run(ctx) {
    const { args, err, session } = ctx;
    let target = 'root';
    let i = 0;
    for (; i < args.length && args[i].startsWith('-'); i++) {
      if (args[i] === '-u') {
        const who = args[++i];
        if (who === undefined) {
          err('sudo: option requires an argument -- u\n');
          return 1;
        }
        target = who;
      } else if (args[i] === '-k') {
        // Forget the cached authentication, like real sudo -k.
        session.sudoAuthed = false;
        return 0;
      } else {
        err(`sudo: invalid option -- '${args[i].replace(/^-+/, '')[0] ?? ''}'\n`);
        return 1;
      }
    }

    const words = args.slice(i);
    if (words.length === 0) {
      err('usage: sudo command [arg ...]\n');
      return 1;
    }
    if (!session.machine.account(target)) {
      err(`sudo: unknown user: ${target}\n`);
      return 1;
    }

    const who = session.credentials();
    // root may run anything as anyone, with no password.
    if (who.uid === 0) return session.runAs(target, words, ctx);

    // Everyone else must be allowed by being in the sudo group.
    if (!who.groups.includes('sudo')) {
      err(`${session.user} is not in the sudoers file. This incident will be reported.\n`);
      return 1;
    }

    const run = (io: { out: (t: string) => void; err: (t: string) => void }) =>
      session.runAs(target, words, { input: ctx.input, out: io.out, err: io.err, clearScreen: ctx.clearScreen, askInput: ctx.askInput });

    // sudo remembers a correct password for a while; if it already has, don't ask again.
    if (session.sudoAuthed) return session.runAs(target, words, ctx);

    const account = session.machine.account(session.user)!;
    ctx.askInput({
      prompt: `[sudo] password for ${session.user}: `,
      secret: true,
      onInput(password, io) {
        if (account.password === undefined || password !== account.password) {
          io.err('Sorry, try again.\nsudo: Authentication failure\n');
          return 1;
        }
        session.sudoAuthed = true;
        return run(io);
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
