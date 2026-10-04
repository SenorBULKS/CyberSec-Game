import type { ListeningSocket, Process } from '../../system/Machine';
import type { Command, CommandContext } from '../types';

/** The player's own two processes in this terminal session: their shell and ps itself. */
function sessionProcesses(user: string): Process[] {
  return [
    { pid: 2451, user, tty: 'pts/0', stat: 'Ss', command: 'bash' },
    { pid: 2473, user, tty: 'pts/0', stat: 'R+', command: 'ps' },
  ];
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

export const ps: Command = {
  name: 'ps',
  summary: 'List running processes (ps aux shows every process on the machine)',
  run({ args, session, out }: CommandContext) {
    const mine = sessionProcesses(session.user);
    // BSD "aux" or Unix "-e"/"-A"/"-ef" all mean "every process".
    const showAll = args.some((a) => a.includes('a') || a.includes('e') || a.includes('A'));

    if (!showAll) {
      out('    PID TTY          TIME CMD\n');
      for (const p of mine) out(`${p.pid.toString().padStart(7)} ${pad(p.tty, 8)} 00:00:00 ${p.command}\n`);
      return 0;
    }

    out(`${pad('USER', 10)} ${'PID'.padStart(6)} ${pad('TTY', 8)} ${pad('STAT', 5)} COMMAND\n`);
    for (const p of [...session.machine.processes, ...mine]) {
      out(`${pad(p.user, 10)} ${p.pid.toString().padStart(6)} ${pad(p.tty, 8)} ${pad(p.stat, 5)} ${p.command}\n`);
    }
    return 0;
  },
};

function peerFor(address: string): string {
  return address.startsWith('[') ? '[::]:*' : '0.0.0.0:*';
}

function processField(socket: ListeningSocket): string {
  if (!socket.process) return '';
  const pid = socket.pid !== undefined ? `,pid=${socket.pid}` : '';
  return `users:(("${socket.process}"${pid}))`;
}

export const crontab: Command = {
  name: 'crontab',
  summary: "List a user's scheduled jobs with crontab -l",
  run({ args, session, out, err }: CommandContext) {
    let list = false;
    let target = session.user;
    const amRoot = session.credentials().uid === 0;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '-l') list = true;
      else if (arg === '-u') {
        const who = args[++i];
        if (!who) {
          err('crontab: option requires an argument -- u\n');
          return 1;
        }
        if (!amRoot && who !== session.user) {
          err('crontab: must be privileged to use -u\n');
          return 1;
        }
        target = who;
      } else if (arg === '-e' || arg === '-r') {
        err(`crontab: ${arg} is not available in this game; crontab files live in /var/spool/cron/crontabs\n`);
        return 1;
      } else {
        err(`crontab: usage error: unrecognized option '${arg}'\nUsage: crontab -l [-u user]\n`);
        return 1;
      }
    }
    if (!list) {
      err('Usage: crontab -l [-u user]\n');
      return 1;
    }
    // crontab is a privileged helper, so it can read a crontab past the spool's directory bits.
    const path = `/var/spool/cron/crontabs/${target}`;
    const found = session.fs.lookup(path);
    if (!found.ok || found.node.type !== 'file') {
      err(`no crontab for ${target}\n`);
      return 1;
    }
    out(found.node.content);
    session.emit({ type: 'read', path, user: session.user });
    return 0;
  },
};

const SIGNALS: Record<string, number> = {
  HUP: 1, INT: 2, QUIT: 3, KILL: 9, TERM: 15, STOP: 19, CONT: 18,
};

/** Reads kill's signal argument, e.g. -9, -KILL, -SIGKILL or `-s TERM`. Returns -1 for a bad name. */
function parseSignal(args: string[]): { signal: number; pids: string[] } {
  let signal = 15;
  const pids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-s') {
      signal = signalNumber(args[++i] ?? '');
    } else if (/^-\d+$/.test(arg)) {
      signal = Number(arg.slice(1));
    } else if (/^-[A-Za-z]/.test(arg)) {
      signal = signalNumber(arg.slice(1));
    } else {
      pids.push(arg);
    }
  }
  return { signal, pids };
}

function signalNumber(name: string): number {
  const upper = name.toUpperCase().replace(/^SIG/, '');
  if (/^\d+$/.test(name)) return Number(name);
  return SIGNALS[upper] ?? -1;
}

export const kill: Command = {
  name: 'kill',
  summary: 'Stop a process by its PID, e.g. kill 1234 or kill -9 1234',
  run({ args, err, session }: CommandContext) {
    const { signal, pids } = parseSignal(args);
    if (pids.length === 0) return usageKill(err);
    if (signal < 0) {
      err('kill: invalid signal specification\n');
      return 1;
    }
    const who = session.credentials();
    let status = 0;
    for (const raw of pids) {
      const pid = Number(raw);
      if (!Number.isInteger(pid)) {
        err(`kill: ${raw}: arguments must be process or job IDs\n`);
        status = 1;
        continue;
      }
      const process = session.machine.process(pid);
      if (!process) {
        err(`kill: (${pid}) - No such process\n`);
        status = 1;
        continue;
      }
      // Only root may signal a process it does not own.
      if (who.uid !== 0 && process.user !== who.user) {
        err(`kill: (${pid}) - Operation not permitted\n`);
        status = 1;
        continue;
      }
      // STOP and CONT pause and resume; they do not end the process.
      if (signal !== 19 && signal !== 18) session.machine.removeProcess(pid);
      session.emit({ type: 'kill', pid, signal, user: session.user });
    }
    return status;
  },
};

function usageKill(err: (t: string) => void): number {
  err('Usage: kill [-s sigspec | -signum] pid...\n');
  return 1;
}

export const ss: Command = {
  name: 'ss',
  summary: 'Show listening network sockets (try ss -tlnp)',
  run({ args, session, out }: CommandContext) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const wantTcp = flags.includes('t');
    const wantUdp = flags.includes('u');
    const showProcess = flags.includes('p');
    // With neither -t nor -u, show both, as ss does.
    const protos = new Set<'tcp' | 'udp'>(
      wantTcp || wantUdp ? ([wantTcp && 'tcp', wantUdp && 'udp'].filter(Boolean) as ('tcp' | 'udp')[]) : ['tcp', 'udp'],
    );

    const header = `${pad('Netid', 6)} ${pad('State', 7)} ${pad('Local Address:Port', 22)} ${pad('Peer Address:Port', 20)}`;
    out(showProcess ? `${header} Process\n` : `${header}\n`);
    for (const socket of session.machine.sockets) {
      if (!protos.has(socket.proto)) continue;
      const local = `${socket.address}:${socket.port}`;
      let row = `${pad(socket.proto, 6)} ${pad('LISTEN', 7)} ${pad(local, 22)} ${pad(peerFor(socket.address), 20)}`;
      if (showProcess) row += ` ${processField(socket)}`;
      out(row + '\n');
    }
    return 0;
  },
};
