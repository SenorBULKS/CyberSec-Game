import { Shell, type PendingInput, type TypedInput } from '../shell/Shell';
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
  /** How many hints the current objective has. */
  hintsTotal: number;
  /** Every message so far, oldest first. */
  messages: readonly GameMessage[];
  /** The messages since the last objective was completed: what the player needs right now. */
  stepMessages: readonly GameMessage[];
  solved: boolean;
}

/** A message for the player from the game, such as a hint or an objective's intro. */
export interface GameMessage {
  kind: 'intro' | 'outro' | 'hint' | 'solved';
  objectiveId?: string;
  text: string;
}

/** One thing the player did, in order: enough to rebuild the game exactly when it is resumed. */
export type LogEntry = TypedInput | { kind: 'hint' };

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
  /** Every message so far, including any sent before the UI subscribed. */
  readonly messages: GameMessage[] = [];
  /** Where the current step's messages start in `messages`. */
  private stepStart = 0;
  /** Everything the player has typed or asked for, oldest first. */
  readonly log: LogEntry[] = [];
  private logListeners = new Set<() => void>();

  /** 'expert' shows coarse goals and their hints; 'guided' shows the step-by-step objectives. */
  private mode: 'guided' | 'expert';

  constructor(readonly challenge: Challenge, mode: 'guided' | 'expert' = 'guided') {
    this.mode = mode;
    const { machine, user, cwd } = challenge.setup();
    this.shell = new Shell({ machine, user, cwd, extraCommands: gameCommands(this) });
    this.shell.onEvent((event) => this.handle(event));
    this.shell.onInput((input) => this.record(input));
    this.introduce(this.currentObjective());
    this.snapshot = this.buildSnapshot();
  }

  /** Switches which objectives (and hints) the player sees; refreshes the snapshot. */
  setMode(mode: 'guided' | 'expert') {
    if (mode === this.mode) return;
    this.mode = mode;
    this.update();
  }

  /** The first objective not yet done, or undefined when all are. */
  currentObjective(): Objective | undefined {
    return this.challenge.objectives.find((o) => !this.done.has(o.id));
  }

  /**
   * What `hint` draws from: in expert mode the current coarse goal and its own
   * hints, otherwise the current granular objective. Expert hint levels are kept
   * under a separate key so switching modes does not mix the two counters.
   */
  private hintTarget(): { id: string; hints: string[] } | undefined {
    const expert = this.challenge.expertObjectives;
    if (this.mode === 'expert' && expert && expert.length > 0) {
      const goal = expert.find((e) => !this.done.has(e.doneWhen));
      return goal ? { id: `expert:${goal.id}`, hints: goal.hints } : undefined;
    }
    const objective = this.currentObjective();
    return objective ? { id: objective.id, hints: objective.hints } : undefined;
  }

  /** Returns the next hint for the current objective (or expert goal), one more level each time. */
  nextHint(): { text: string; level: number; of: number } | undefined {
    const target = this.hintTarget();
    if (!target || target.hints.length === 0) return undefined;
    const level = Math.min((this.hintLevel.get(target.id) ?? 0) + 1, target.hints.length);
    this.hintLevel.set(target.id, level);
    const text = target.hints[level - 1];
    this.send({ kind: 'hint', objectiveId: target.id, text });
    this.update();
    return { text, level, of: target.hints.length };
  }

  /** A hint asked for from the mission panel rather than with the `hint` command. */
  requestHint() {
    this.record({ kind: 'hint' });
    return this.nextHint();
  }

  /**
   * Replays a saved log to rebuild a game where the player left it. Returns
   * what the terminal showed, so the screen can be put back too.
   */
  restore(log: readonly LogEntry[]): string {
    let screen = '';
    let pending: PendingInput | undefined;
    const show = (output: string) => {
      screen += output && !output.endsWith('\n') ? output + '\n' : output;
    };
    for (const entry of log) {
      if (entry.kind === 'hint') {
        this.requestHint();
      } else if (entry.kind === 'answer') {
        if (!pending) continue;
        screen += pending.prompt + (pending.secret ? '' : entry.text) + '\n';
        const result = pending.submit(entry.text);
        pending = result.input;
        show(result.output);
      } else {
        // A line typed while a prompt was waiting means the player pressed Ctrl+C on it.
        if (pending) screen += pending.prompt + '^C\n';
        screen += this.shell.promptAnsi() + entry.text + '\n';
        const result = this.shell.execute(entry.text);
        if (result.clearScreen) screen = '';
        pending = result.input;
        show(result.output);
      }
    }
    if (pending) screen += pending.prompt + '^C\n';
    return screen;
  }

  /** Called whenever the log grows, e.g. to save the game. */
  onLog(listener: () => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  /** Numbers for the debrief. */
  stats(): { commands: number; hints: number } {
    return {
      commands: this.log.filter((e) => e.kind === 'line').length,
      hints: this.messages.filter((m) => m.kind === 'hint').length,
    };
  }

  private record(entry: LogEntry) {
    this.log.push(entry);
    for (const listener of this.logListeners) listener();
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

    // A new step starts: earlier messages are no longer what the player needs.
    this.stepStart = this.messages.length;
    // Doing a later step proves the earlier ones weren't needed: tick them off
    // silently. Only the step the player actually hit gets its outro, so the
    // feed never fills with notes for steps they skipped (many of which would be
    // untrue for how they got here). Objectives marked noSkip are the exception:
    // a required action (e.g. reporting the answer) is never implied by a later
    // step, so it stays open until the player does it for real.
    for (const objective of objectives.slice(0, hit)) {
      if (!objective.noSkip) this.done.add(objective.id);
    }
    const reached = objectives[hit];
    this.done.add(reached.id);
    if (reached.outro) this.send({ kind: 'outro', objectiveId: reached.id, text: reached.outro });
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
    const hintTarget = this.hintTarget();
    return {
      objectives: this.challenge.objectives.map((o) => ({
        id: o.id,
        title: o.title,
        done: this.done.has(o.id),
        current: o === current,
      })),
      hintsShown: hintTarget ? (this.hintLevel.get(hintTarget.id) ?? 0) : 0,
      hintsTotal: hintTarget?.hints.length ?? 0,
      messages: [...this.messages],
      stepMessages: this.messages.slice(this.stepStart),
      solved: this.solved,
    };
  }
}
