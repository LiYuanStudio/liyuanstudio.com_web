import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductsPage } from './ProductsPage.js';
import { expectNoAccessibilityViolations } from '../test/accessibility.js';

describe('ProductsPage', () => {
  it('renders the product collage with the intended destinations', () => {
    const { container } = render(<ProductsPage />);

    expect(screen.getByRole('heading', { name: '产品' })).toBeInTheDocument();
    const desktopLink = screen.getByRole('link', { name: '查看详情：Papyrus Desktop' });
    expect(desktopLink).toHaveAttribute('href', '/products/papyrusdesktop/');
    expect(desktopLink).not.toHaveAttribute('target');
    expect(desktopLink).not.toHaveAttribute('rel');

    const papyrusLink = screen.getByRole('link', { name: '前往 GitHub：Papyrus' });
    expect(papyrusLink).toHaveAttribute('href', 'https://github.com/PapyrusOR/Papyrus');
    expect(papyrusLink).toHaveAttribute('target', '_blank');
    expect(papyrusLink).toHaveAttribute('rel', 'noopener noreferrer');

    const cliLink = screen.getByRole('link', { name: '前往 GitHub：Papyrus CLI' });
    expect(cliLink).toHaveAttribute('href', 'https://github.com/PapyrusOR/Papyrus_CLI');
    expect(cliLink).toHaveAttribute('target', '_blank');
    expect(cliLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.querySelectorAll('.collage-card')).toHaveLength(3);
  });

  it('marks products as the current content hub section', () => {
    render(<ProductsPage />);

    const navigation = within(screen.getByRole('navigation', { name: '主导航' }));
    expect(navigation.getByRole('link', { name: '产品' })).toHaveAttribute('aria-current', 'page');
    expect(navigation.getByRole('link', { name: '动态' })).not.toHaveAttribute('aria-current');
    expect(navigation.getByRole('link', { name: '博客' })).not.toHaveAttribute('aria-current');
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<ProductsPage />);
    await expectNoAccessibilityViolations(container);
  });
});
