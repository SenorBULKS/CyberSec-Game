import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { practice } from '../challenges/practice';
import { ChallengeRun } from './ChallengeRun';
import { MissionPanel, type PlayMode } from './MissionPanel';
import { RichText } from './RichText';

afterEach(cleanup);

function setup(mode: PlayMode = 'guided') {
  const run = new ChallengeRun(practice);
  const modes: PlayMode[] = [];
  const view = render(<MissionPanel run={run} mode={mode} onModeChange={(m) => modes.push(m)} />);
  const feed = () => screen.getByRole('log');
  return { run, modes, view, feed };
}

describe('RichText', () => {
  it('renders code, bold and glossary terms', () => {
    const { container } = render(<RichText text="Run `ls` **now** in the [[terminal|black window]]." />);
    expect(container.querySelector('code')?.textContent).toBe('ls');
    expect(container.querySelector('strong')?.textContent).toBe('now');
    expect(screen.getByRole('button', { name: 'black window' })).toBeTruthy();
  });

  it('opens and closes a glossary definition', () => {
    render(<RichText text="Open the [[terminal]]." />);
    const word = screen.getByRole('button', { name: 'terminal' });
    expect(word.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(word);
    expect(word.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('note').textContent).toContain('A text window for controlling a computer');
    fireEvent.click(word);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows definitions under the text, keeping the sentence whole', () => {
    const { container } = render(<RichText text="A [[server]] runs in a [[directory]] tree." />);
    fireEvent.click(screen.getByRole('button', { name: 'directory' }));
    fireEvent.click(screen.getByRole('button', { name: 'server' }));
    expect(container.textContent).toMatch(/^A server runs in a directory tree\.directory: A folder\..*server: A computer/);
  });

  it('shows an unknown term as plain text', () => {
    const { container } = render(<RichText text="A [[gizmo]] here." />);
    expect(container.textContent).toBe('A gizmo here.');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('MissionPanel', () => {
  it('shows the briefing, objectives and first intro', () => {
    const { feed } = setup();
    expect(screen.getByRole('heading', { name: 'Practice Run' })).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.className);
    expect(items).toEqual(['current', '', '']);
    expect(feed().textContent).toContain('lists the files');
    expect(within(feed()).getByText(/Sam/)).toBeTruthy();
  });

  it('adds messages to the feed as the player progresses', () => {
    const { run, feed } = setup();
    act(() => void run.shell.execute('ls'));
    expect(feed().textContent).toContain('There is a file called note.txt here.');
    expect(feed().textContent).toContain('prints what is inside a file');
    expect(screen.getAllByRole('listitem').map((li) => li.className)).toEqual(['done', 'current', '']);
  });

  it('hands out hints from the button, then runs out', () => {
    const { feed } = setup();
    const button = () => screen.getByRole('button', { name: /hint/i });
    expect(button().textContent).toBe('Get a hint (1 of 3)');
    fireEvent.click(button());
    expect(feed().textContent).toContain('Which command lists files?');
    expect(button().textContent).toBe('Get a hint (2 of 3)');
    fireEvent.click(button());
    fireEvent.click(button());
    expect(button().textContent).toBe('No more hints for this step');
    expect((button() as HTMLButtonElement).disabled).toBe(true);
  });

  it('counts hints typed in the terminal too', () => {
    const { run } = setup();
    act(() => void run.shell.execute('hint'));
    expect(screen.getByRole('button', { name: /hint/i }).textContent).toBe('Get a hint (2 of 3)');
  });

  it('hides the mentor lessons in "I know Linux" mode but keeps hints and results', () => {
    const { run, feed } = setup('expert');
    expect(feed().textContent).toBe('');
    act(() => void run.nextHint());
    act(() => void run.shell.execute('submit PRACTICE-42'));
    expect(feed().textContent).toContain('Which command lists files?');
    expect(feed().textContent).toContain('Challenge complete.');
    expect(feed().textContent).not.toContain('lists the files in the');
  });

  it('switches mode', () => {
    const { modes } = setup();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    fireEvent.click(screen.getByRole('radio', { name: 'I know Linux' }));
    expect(modes).toEqual(['expert']);
  });

  it('removes the hint button once solved', () => {
    const { run } = setup();
    act(() => void run.shell.execute('submit PRACTICE-42'));
    expect(screen.queryByRole('button', { name: /hint/i })).toBeNull();
    expect(screen.getAllByRole('listitem').map((li) => li.className)).toEqual(['done', 'done', 'done']);
  });
});
