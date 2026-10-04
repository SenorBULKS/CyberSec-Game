import { builtins } from '../builtins';
import type { Command } from '../types';
import { cat } from './cat';
import { cd } from './cd';
import { chmod, chown, find, rm, stat } from './files';
import { hostname, id, whoami } from './identity';
import { ls } from './ls';
import { pwd } from './pwd';
import { exit, su } from './su';
import { crontab, kill, ps, ss } from './system';
import { grep, head, less, tail, wc } from './textTools';

export const allCommands: Command[] = [
  ...builtins,
  cat,
  cd,
  chmod,
  chown,
  crontab,
  exit,
  find,
  grep,
  head,
  hostname,
  id,
  kill,
  less,
  ls,
  ps,
  pwd,
  rm,
  ss,
  stat,
  su,
  tail,
  wc,
  whoami,
];
