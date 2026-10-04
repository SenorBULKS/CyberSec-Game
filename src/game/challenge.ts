import type { Machine } from '../system/Machine';
import type { GameEvent } from './events';

/** Decides whether an event completes an objective. */
export type Trigger = (event: GameEvent) => boolean;

export interface Objective {
  id: string;
  /** Short checklist line, e.g. "Find out who you are logged in as". */
  title: string;
  /** What the mentor says when this becomes the current objective. */
  intro?: string;
  /** What the mentor says when it is done. */
  outro?: string;
  /** Three hints, from a gentle nudge to the exact command. */
  hints: string[];
  completeWhen: Trigger;
}

export interface ChallengeSetup {
  machine: Machine;
  /** Who the player is logged in as. */
  user: string;
  /** Where the player starts; defaults to their home directory. */
  cwd?: string;
}

/** The screen shown after a challenge is solved: what just happened, in real-world terms. */
export interface Debrief {
  /** A sentence or two on what the player just did. */
  summary: string;
  sections: { title: string; text: string }[];
}

export interface Challenge {
  id: string;
  title: string;
  /** One line for the title screen. */
  summary: string;
  /** Who it is for, e.g. "Beginner". */
  level: string;
  /** Left off the title screen; still playable from its #anchor. */
  hidden?: boolean;
  /** Builds a fresh copy of the world every time the challenge starts. */
  setup: () => ChallengeSetup;
  /** Printed in the terminal before the first prompt, like a login banner. */
  motd: string;
  /** Mission text for the panel: who you are and what you have to do. */
  briefing: string;
  /** The colleague whose chat messages guide the player. */
  mentor: { name: string; role: string };
  objectives: Objective[];
  debrief?: Debrief;
  /** The code the player finds and enters with `submit`. Compared ignoring case and outer spaces. */
  answer: string;
}

// Trigger helpers keep challenge files readable: completeWhen: readFile('/etc/hostname').

export const ranCommand =
  (name: string, user?: string): Trigger =>
  (e) =>
    e.type === 'command' && e.name === name && e.exitCode === 0 && (!user || e.user === user);

export const readFile =
  (path: string, user?: string): Trigger =>
  (e) =>
    e.type === 'read' && e.path === path && (!user || e.user === user);

export const listedDir =
  (path: string, options: { all?: boolean } = {}): Trigger =>
  (e) =>
    e.type === 'list' && e.path === path && (!options.all || e.all);

export const enteredDir =
  (path: string): Trigger =>
  (e) =>
    e.type === 'cd' && e.path === path;

export const becameUser =
  (user: string): Trigger =>
  (e) =>
    e.type === 'su' && e.user === user;

export const submittedAnswer: Trigger = (e) => e.type === 'submit' && e.correct;

/** Completes when any of the triggers fires. */
export const anyOf =
  (...triggers: Trigger[]): Trigger =>
  (e) =>
    triggers.some((t) => t(e));
