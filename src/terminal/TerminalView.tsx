import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { createSandboxShell } from '../content/sandbox';
import { TerminalController } from './TerminalController';

const MOTD =
  'Welcome to the Harborline Logistics server.\n' +
  'Type \x1b[1mhelp\x1b[0m and press Enter to see what you can do.\n\n';

export function TerminalView() {
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

    const controller = new TerminalController(term, createSandboxShell(), { motd: MOTD });
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
  }, []);

  return <div className="terminal-host" ref={hostRef} data-testid="terminal" />;
}
