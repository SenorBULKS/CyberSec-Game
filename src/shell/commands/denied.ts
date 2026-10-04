import type { Session } from '../types';

/** Tells the game the player was refused access to a path. */
export function denied(session: Session, arg: string) {
  session.emit({ type: 'denied', path: session.resolve(arg), user: session.user });
}
