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
