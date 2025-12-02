import { describe, it, expect } from 'vitest';

describe('Frontend Sanity Check', () => {
  it('should pass basic math', () => {
    expect(1 + 1).toBe(2);
  });

  it('environment should be jsdom', () => {
    expect(window).toBeDefined();
  });
});
