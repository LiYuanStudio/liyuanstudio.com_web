import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeroVisual } from './HeroVisual.js';

describe('HeroVisual', () => {
  it('keeps the canvas visual decorative when canvas rendering is unavailable', () => {
    const { container } = render(<HeroVisual />);

    const root = container.querySelector('.hero-visual');
    expect(root).toBeInTheDocument();
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas?.closest('[aria-hidden="true"]')).toBeInTheDocument();
    expect(root?.querySelector('a, button, input, [tabindex]')).toBeNull();
  });
});
