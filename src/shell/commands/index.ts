import { builtins } from '../builtins';
import type { Command } from '../types';
import { cat } from './cat';
import { cd } from './cd';
import { hostname, id, whoami } from './identity';
import { ls } from './ls';
import { pwd } from './pwd';
import { exit, su } from './su';

export const allCommands: Command[] = [...builtins, cat, cd, exit, hostname, id, ls, pwd, su, whoami];
