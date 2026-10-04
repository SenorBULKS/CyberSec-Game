import type { Command } from '../shell/types';
import type { ChallengeRun } from './ChallengeRun';
import { toTerminal } from './markup';

const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[1;32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

/** Game commands that exist only while a challenge is running. They are not part of Linux. */
export function gameCommands(run: ChallengeRun): Command[] {
  const hint: Command = {
    name: 'hint',
    summary: 'Get a hint for your current objective (game command)',
    run({ out }) {
      const result = run.nextHint();
      if (!result) {
        out(`${DIM}No hints needed: every objective is done.${RESET}\n`);
        return 0;
      }
      const last = result.level === result.of ? ' (last hint)' : '';
      out(`${YELLOW}Hint ${result.level} of ${result.of}${last}:${RESET} ${toTerminal(result.text)}\n`);
      return 0;
    },
  };

  const submit: Command = {
    name: 'submit',
    summary: 'Enter the code you found to finish the challenge (game command)',
    run({ args, out }) {
      if (args.length === 0) {
        out(`Usage: submit <code>\n${DIM}Type the code you found, for example: submit ABC-123${RESET}\n`);
        return 2;
      }
      if (run.submit(args.join(' '))) {
        if (run.getSnapshot().solved) {
          out(`${GREEN}✔ Correct! Challenge complete.${RESET}\n`);
        } else {
          // The answer is right, but the challenge has objectives left (e.g. remediation).
          out(`${GREEN}✔ Correct.${RESET} ${DIM}That is the right code, but you are not done yet — check your remaining objective.${RESET}\n`);
        }
        return 0;
      }
      out(`${RED}✘ That is not the right code.${RESET} Check where you found it and try again.\n`);
      return 1;
    },
  };

  return [hint, submit];
}
