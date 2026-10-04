import { builtins } from '../builtins';
import type { Command } from '../types';
import { cat } from './cat';
import { cd } from './cd';
import { ls } from './ls';
import { pwd } from './pwd';

export const allCommands: Command[] = [...builtins, cat, cd, ls, pwd];
