import type { Command } from './types';

export const echo: Command = {
  name: 'echo',
  summary: 'Print text back to the screen',
  run({ args, out }) {
    let newline = true;
    let rest = args;
    if (rest[0] === '-n') {
      newline = false;
      rest = rest.slice(1);
    }
    out(rest.join(' ') + (newline ? '\n' : ''));
    return 0;
  },
};

export const truthy: Command = {
  name: 'true',
  summary: 'Do nothing, successfully (exit status 0)',
  run() {
    return 0;
  },
};

export const falsy: Command = {
  name: 'false',
  summary: 'Do nothing, unsuccessfully (exit status 1)',
  run() {
    return 1;
  },
};

export const clear: Command = {
  name: 'clear',
  summary: 'Clear the screen (Ctrl+L also works)',
  run({ clearScreen }) {
    clearScreen();
    return 0;
  },
};

export const help: Command = {
  name: 'help',
  summary: 'List the commands you can use',
  run({ args, out, err, shell }) {
    if (args.length > 0) {
      const summary = shell.describe(args[0]);
      if (!summary) {
        err(`help: no help topics match \`${args[0]}'.\n`);
        return 1;
      }
      out(`${args[0]}: ${summary}\n`);
      return 0;
    }
    const names = shell.commandNames();
    const width = Math.max(...names.map((n) => n.length)) + 2;
    out('Commands available on this system:\n\n');
    for (const name of names) {
      out(`  ${name.padEnd(width)}${shell.describe(name)}\n`);
    }
    out('\nKeys: Up/Down recall earlier commands, Ctrl+C cancels the current line.\n');
    return 0;
  },
};

export const history: Command = {
  name: 'history',
  summary: 'Show the commands you have run this session (history -c clears it)',
  run({ args, out, err, shell }) {
    if (args[0] === '-c') {
      shell.clearHistory();
      return 0;
    }
    const entries = shell.history();
    let start = 0;
    if (args[0] !== undefined) {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 0) {
        err(`history: ${args[0]}: numeric argument required\n`);
        return 1;
      }
      start = Math.max(0, entries.length - n);
    }
    for (let i = start; i < entries.length; i++) {
      out(`${String(i + 1).padStart(5)}  ${entries[i]}\n`);
    }
    return 0;
  },
};

export const builtins: Command[] = [clear, echo, falsy, help, history, truthy];
