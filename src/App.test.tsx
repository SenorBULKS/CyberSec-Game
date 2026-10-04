import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('shows the terminal and the mission panel side by side', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Mission' })).toBeTruthy();
  });
});
