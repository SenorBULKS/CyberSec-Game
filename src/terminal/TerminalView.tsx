import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { Shell } from '../shell/Shell';
import { TerminalController } from './TerminalController';

interface Props {
  shell: Shell;
  /** Banner printed before the first prompt. */
  motd: string;
  /** Commands from a resumed game, for the Up arrow. */
  history?: readonly string[];
}

export function TerminalView({ shell, motd, history }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, 'Liberation Mono', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      scrollback: 2000,
      theme: {
        background: '#010409',
        foreground: '#e6edf3',
        cursor: '#e6edf3',
        selectionBackground: '#264f78',
        green: '#3fb950',
        brightGreen: '#56d364',
        blue: '#58a6ff',
        brightBlue: '#79c0ff',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const controller = new TerminalController(term, shell, { motd, history });
    const input = term.onData((data) => controller.handleInput(data));
    controller.start();
    term.focus();

    const resize = new ResizeObserver(() => fit.fit());
    resize.observe(host);

    return () => {
      resize.disconnect();
      input.dispose();
      term.dispose();
    };
  }, [shell, motd, history]);

  return <div className="terminal-host" ref={hostRef} data-testid="terminal" />;
}
