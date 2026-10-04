export interface ColumnItem {
  /** What gets printed, possibly with color codes. */
  display: string;
  /** Visible width in characters. */
  width: number;
}

const GAP = 2;

/**
 * Lays items out in columns filled top to bottom, like GNU `ls` does on a
 * terminal: as many columns as fit in `lineWidth`, two spaces between them.
 */
export function formatColumns(items: ColumnItem[], lineWidth: number): string {
  if (items.length === 0) return '';

  for (let cols = items.length; cols >= 1; cols--) {
    const rows = Math.ceil(items.length / cols);
    const usedCols = Math.ceil(items.length / rows);
    const widths: number[] = [];
    for (let c = 0; c < usedCols; c++) {
      const column = items.slice(c * rows, (c + 1) * rows);
      widths.push(Math.max(...column.map((item) => item.width)));
    }
    const total = widths.reduce((sum, w) => sum + w, 0) + GAP * (usedCols - 1);
    // GNU ls keeps lines strictly shorter than the terminal width.
    if (total >= lineWidth && cols > 1) continue;

    let text = '';
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < usedCols; c++) {
        const item = items[c * rows + r];
        if (!item) continue;
        const isLast = c === usedCols - 1 || !items[(c + 1) * rows + r];
        line += item.display + (isLast ? '' : ' '.repeat(widths[c] - item.width + GAP));
      }
      text += line + '\n';
    }
    return text;
  }
  return '';
}

/**
 * Sorts file names the way `ls` does under the C.UTF-8 locale (Ubuntu's
 * server default): by character code, so dot files come first and capitals
 * before lowercase. Grouping hidden files together also makes them easy to spot.
 */
export function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
