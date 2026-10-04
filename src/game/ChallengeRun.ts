import { Shell } from '../shell/Shell';
import type { Challenge, Objective } from './challenge';
import type { GameEvent } from './events';
import { gameCommands } from './commands';

export interface ObjectiveState {
  id: string;
  title: string;
  done: boolean;
  current: boolean;
}

export interface RunSnapshot {
  objectives: ObjectiveState[];
  /** How many hints the player has seen for the current objective. */
  hintsShown: number;
  solved: boolean;
}

/** A message for the player from the game, such as a hint or an objective's intro. */
export interface GameMessage {
  kind: 'intro' | 'outro' | 'hint' | 'solved';
  objectiveId?: string;
  text: string;
}

/**
 * One play of a challenge: builds its world, watches what the player does,
 * ticks off objectives, hands out hints and checks the final answer.
 */
export class ChallengeRun {
  readonly shell: Shell;
  private done = new Set<string>();
  private hintLevel = new Map<string, number>();
  private solved = false;
  private snapshot: RunSnapshot;
  private listeners = new Set<() => void>();
  private messageListeners = new Set<(message: GameMessage) => void>();
  /** Messages sent before anyone listened, e.g. the first objective's intro. */
  readonly messages: GameMessage[] = [];

  constructor(readonly challenge: Challenge) {
    const { machine, user, cwd } = challenge.setup();
    this.shell = new Shell({ machine, user, cwd, extraCommands: gameCommands(this) });
    this.shell.onEvent((event) => this.handle(event));
    this.snapshot = this.buildSnapshot();
    this.introduce(this.currentObjective());
  }

  /** The first objective not yet done, or undefined when all are. */
  currentObjective(): Objective | undefined {
    return this.challenge.objectives.find((o) => !this.done.has(o.id));
  }

  /** Returns the next hint for the current objective, revealing one more level each time. */
  nextHint(): { text: string; level: number; of: number } | undefined {
    const objective = this.currentObjective();
    if (!objective || objective.hints.length === 0) return undefined;
    const level = Math.min((this.hintLevel.get(objective.id) ?? 0) + 1, objective.hints.length);
    this.hintLevel.set(objective.id, level);
    const text = objective.hints[level - 1];
    this.send({ kind: 'hint', objectiveId: objective.id, text });
    this.update();
    return { text, level, of: objective.hints.length };
  }

  /** Checks an answer given with `submit`. */
  submit(answer: string): boolean {
    const correct = answer.trim().toLowerCase() === this.challenge.answer.trim().toLowerCase();
    this.handle({ type: 'submit', answer, correct });
    return correct;
  }

  getSnapshot = (): RunSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onMessage(listener: (message: GameMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private handle(event: GameEvent) {
    const objectives = this.challenge.objectives;
    const hit = objectives.findIndex((o) => !this.done.has(o.id) && o.completeWhen(event));
    if (hit === -1) return;

    // Doing a later step proves the earlier ones weren't needed: tick them too.
    for (const objective of objectives.slice(0, hit + 1)) {
      if (this.done.has(objective.id)) continue;
      this.done.add(objective.id);
      if (objective.outro) this.send({ kind: 'outro', objectiveId: objective.id, text: objective.outro });
    }
    if (objectives.every((o) => this.done.has(o.id))) {
      this.solved = true;
      this.send({ kind: 'solved', text: this.challenge.title });
    } else {
      this.introduce(this.currentObjective());
    }
    this.update();
  }

  private introduce(objective: Objective | undefined) {
    if (objective?.intro) this.send({ kind: 'intro', objectiveId: objective.id, text: objective.intro });
  }

  private send(message: GameMessage) {
    this.messages.push(message);
    for (const listener of this.messageListeners) listener(message);
  }

  private update() {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): RunSnapshot {
    const current = this.currentObjective();
    return {
      objectives: this.challenge.objectives.map((o) => ({
        id: o.id,
        title: o.title,
        done: this.done.has(o.id),
        current: o === current,
      })),
      hintsShown: current ? (this.hintLevel.get(current.id) ?? 0) : 0,
      solved: this.solved,
    };
  }
}
