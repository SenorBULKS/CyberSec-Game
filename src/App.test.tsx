import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

// xterm.js needs a real browser to render; the e2e tests cover it.
vi.mock('./terminal/TerminalView', () => ({ TerminalView: () => <div data-testid="terminal" /> }));

describe('App', () => {
  it('shows the terminal and the mission panel side by side', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Mission' })).toBeTruthy();
    expect(screen.getByTestId('terminal')).toBeTruthy();
  });
});
