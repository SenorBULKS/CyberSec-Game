import { builtins } from '../builtins';
import type { Command } from '../types';
import { cat } from './cat';
import { cd } from './cd';
import { hostname, id, whoami } from './identity';
import { ls } from './ls';
import { pwd } from './pwd';

export const allCommands: Command[] = [...builtins, cat, cd, hostname, id, ls, pwd, whoami];
