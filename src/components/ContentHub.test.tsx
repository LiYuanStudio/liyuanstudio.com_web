import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollageGrid } from './ContentHub.js';

function renderGrid(itemCount: number) {
  return render(
    <CollageGrid>
      {Array.from({ length: itemCount }, (_, index) => (
        <article className="collage-card" key={index}>
          Item {index + 1}
        </article>
      ))}
    </CollageGrid>,
  );
}

describe('CollageGrid', () => {
  it('keeps the existing layout for fewer than five items', () => {
    const { container } = renderGrid(3);

    expect(container.querySelector('.collage-grid')).not.toHaveClass('collage-grid-five-up');
    expect(container.querySelectorAll('.collage-card')).toHaveLength(3);
  });

  it('enables the compact desktop layout for five items', () => {
    const { container } = renderGrid(5);

    expect(container.querySelector('.collage-grid')).toHaveClass('collage-grid-five-up');
    expect(container.querySelectorAll('.collage-card')).toHaveLength(5);
  });

  it('keeps every item when the collage contains more than five', () => {
    const { container } = renderGrid(7);

    expect(container.querySelector('.collage-grid')).toHaveClass('collage-grid-five-up');
    expect(container.querySelectorAll('.collage-card')).toHaveLength(7);
  });
});
