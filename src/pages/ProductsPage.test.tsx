import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductsPage } from './ProductsPage.js';
import { expectNoAccessibilityViolations } from '../test/accessibility.js';

describe('ProductsPage', () => {
  it('renders the product collage with the intended destinations', () => {
    const { container } = render(<ProductsPage />);

    expect(screen.getByRole('heading', { name: '产品' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看详情：Papyrus Desktop' }))
      .toHaveAttribute('href', '/products/papyrusdesktop/');
    expect(screen.getByRole('link', { name: '前往 GitHub：Papyrus' }))
      .toHaveAttribute('href', 'https://github.com/PapyrusOR/Papyrus');
    expect(screen.getByRole('link', { name: '前往 GitHub：Papyrus CLI' }))
      .toHaveAttribute('href', 'https://github.com/PapyrusOR/Papyrus_CLI');
    expect(container.querySelectorAll('.collage-card')).toHaveLength(3);
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<ProductsPage />);
    await expectNoAccessibilityViolations(container);
  });
});
