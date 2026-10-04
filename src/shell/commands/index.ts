import { builtins } from '../builtins';
import type { Command } from '../types';
import { cat } from './cat';
import { cd } from './cd';
import { hostname, id, whoami } from './identity';
import { ls } from './ls';
import { pwd } from './pwd';
import { exit, su } from './su';
import { crontab, ps, ss } from './system';
import { grep, head, less, tail, wc } from './textTools';

export const allCommands: Command[] = [
  ...builtins,
  cat,
  cd,
  crontab,
  exit,
  grep,
  head,
  hostname,
  id,
  less,
  ls,
  ps,
  pwd,
  ss,
  su,
  tail,
  wc,
  whoami,
];
