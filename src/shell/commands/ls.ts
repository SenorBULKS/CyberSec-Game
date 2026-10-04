import { ERRORS, type FsNode } from '../../fs/FileSystem';
import { compareNames, formatColumns, type ColumnItem } from '../format';
import type { Command } from '../types';

// Ubuntu's default LS_COLORS for the common cases.
const COLOR = {
  dir: '\x1b[01;34m',
  stickyOtherWritable: '\x1b[30;42m',
  exec: '\x1b[01;32m',
  reset: '\x1b[0m',
};

function colorize(name: string, node: FsNode): string {
  if (node.type === 'dir') {
    const color = (node.mode & 0o1002) === 0o1002 ? COLOR.stickyOtherWritable : COLOR.dir;
    return color + name + COLOR.reset;
  }
  if (node.mode & 0o111) return COLOR.exec + name + COLOR.reset;
  return name;
}

function item(name: string, node: FsNode): ColumnItem {
  return { display: colorize(name, node), width: name.length };
}

export const ls: Command = {
  name: 'ls',
  summary: 'List the files in a directory',
  run({ args, out, err, session }) {
    for (const arg of args) {
      if (arg.startsWith('-') && arg !== '-') {
        err(`ls: invalid option -- '${arg[1]}'\nTry 'ls --help' for more information.\n`);
        return 2;
      }
    }

    const operands = args.length > 0 ? args : ['.'];
    let status = 0;
    const files: ColumnItem[] = [];
    const dirs: { label: string; node: Extract<FsNode, { type: 'dir' }> }[] = [];

    for (const arg of operands) {
      const found = session.fs.lookup(session.resolve(arg));
      if (!found.ok) {
        err(`ls: cannot access '${arg}': ${ERRORS[found.code]}\n`);
        status = 2;
      } else if (found.node.type === 'dir') {
        dirs.push({ label: arg, node: found.node });
      } else {
        files.push(item(arg, found.node));
      }
    }

    const sections: string[] = [];
    if (files.length > 0) sections.push(formatColumns(files, session.columns));
    dirs.sort((a, b) => compareNames(a.label, b.label));
    const showHeaders = operands.length > 1;
    for (const { label, node } of dirs) {
      const names = [...node.children.keys()].filter((n) => !n.startsWith('.')).sort(compareNames);
      const listing = formatColumns(
        names.map((n) => item(n, node.children.get(n)!)),
        session.columns,
      );
      sections.push(showHeaders ? `${label}:\n${listing}` : listing);
    }
    out(sections.join('\n'));
    return status;
  },
};
