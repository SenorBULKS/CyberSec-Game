import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { Shell } from './shell/Shell';

// xterm.js needs a real browser to render; the e2e tests cover it. The stand-in
// keeps the shell and banner it was given so tests can type and check the screen.
let shell: Shell | undefined;
vi.mock('./terminal/TerminalView', () => ({
  TerminalView: (props: { shell: Shell; motd: string; history?: readonly string[] }) => {
    shell = props.shell;
    return (
      <pre data-testid="terminal" data-history={(props.history ?? []).join('|')}>
        {props.motd}
      </pre>
    );
  },
}));

const type = (line: string) => act(() => void shell!.execute(line));
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const card = (title: string) => screen.getByRole('listitem', { name: title });

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});
afterEach(cleanup);

describe('title screen', () => {
  it('opens on the title screen with the listed challenges', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'CyberSec Game' })).toBeTruthy();
    expect(within(card('Practice Run')).getByText('Not started')).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: 'Sandbox' })).toBeNull();
  });

  it('starts a challenge in the chosen mode', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /I already know Linux/ }));
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'I know Linux' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opens a challenge straight from its #anchor', () => {
    window.location.hash = '#practice';
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Mission' })).toBeTruthy();
  });
});

describe('saving', () => {
  it('saves progress and continues where the player left off', () => {
    const first = render(<App />);
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Start' }));
    type('ls');
    fireEvent.click(button(/Get a hint/));
    first.unmount();

    render(<App />);
    expect(within(card('Practice Run')).getByText('In progress')).toBeTruthy();
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Continue' }));
    const items = screen.getAllByRole('listitem').map((li) => li.className);
    expect(items).toEqual(['done', 'current', '']);
    expect(screen.getByRole('log').textContent).toContain('Which command shows what is inside a file?');
    expect(screen.getByTestId('terminal').textContent).toContain('$ ls\nnote.txt\n');
    expect(screen.getByTestId('terminal').dataset.history).toBe('ls');
  });

  it('starting over clears the saved game, after asking', () => {
    const first = render(<App />);
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Start' }));
    type('ls');
    first.unmount();

    render(<App />);
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Start over' }));
    expect(within(card('Practice Run')).getByText('Lose your progress?')).toBeTruthy();
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Start over' }));
    expect(screen.getAllByRole('listitem').map((li) => li.className)).toEqual(['current', '', '']);
  });

  it('restart from the top bar starts the challenge fresh', () => {
    render(<App />);
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Start' }));
    type('ls');
    fireEvent.click(button('Restart'));
    fireEvent.click(within(screen.getByRole('group', { name: /Restart and lose/ })).getByRole('button', { name: 'Restart' }));
    expect(screen.getAllByRole('listitem').map((li) => li.className)).toEqual(['current', '', '']);
    expect(screen.getByTestId('terminal').textContent).not.toContain('note.txt');
  });

  it('plays on without saving when storage is blocked', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<App />);
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Start' }));
    type('ls');
    expect(screen.getAllByRole('listitem').map((li) => li.className)).toEqual(['done', 'current', '']);
    setItem.mockRestore();
  });
});

describe('debrief', () => {
  it('opens after solving, shows the numbers, and stays reachable from the title screen', () => {
    const first = render(<App />);
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Start' }));
    fireEvent.click(button(/Get a hint/));
    type('cat note.txt');
    type('submit PRACTICE-42');
    fireEvent.click(button('Read the debrief'));
    expect(screen.getByRole('heading', { name: 'Practice Run: complete' })).toBeTruthy();
    const stats = screen.getByRole('main').querySelector('.debrief-stats')!.textContent;
    expect(stats).toBe('Commands typed2Hints used1');
    expect(screen.getByRole('heading', { name: 'What you used' })).toBeTruthy();
    fireEvent.click(button('Back to the challenges'));
    expect(within(card('Practice Run')).getByText('Completed')).toBeTruthy();
    first.unmount();

    render(<App />);
    fireEvent.click(within(card('Practice Run')).getByRole('button', { name: 'Read the debrief' }));
    expect(screen.getByRole('heading', { name: 'Practice Run: complete' })).toBeTruthy();
    fireEvent.click(button('Back to the terminal'));
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeTruthy();
  });
});
