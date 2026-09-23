import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeroVisual } from './HeroVisual.js';

describe('HeroVisual', () => {
  it('renders a fixed silver dot-matrix globe as decorative content', () => {
    const { container } = render(<HeroVisual />);

    const root = container.querySelector('.hero-visual');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.hv-globe')).toBeInTheDocument();
    expect(container.querySelectorAll('#hv-silver-shade stop')).toHaveLength(4);
    expect(container.querySelectorAll('.hv-edge-accent').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-depth]')).not.toBeInTheDocument();
  });
});
