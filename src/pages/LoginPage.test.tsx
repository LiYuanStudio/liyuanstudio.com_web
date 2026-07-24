import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth } from '../context/AuthContext.js';
import { LoginPage } from './LoginPage.js';
import { expectNoAccessibilityViolations } from '../test/accessibility.js';

vi.mock('../context/AuthContext.js');

const mockUseAuth = vi.mocked(useAuth);

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
      login: vi.fn().mockResolvedValue(undefined),
      sendRegistrationCode: vi.fn().mockResolvedValue(undefined),
      verifyRegistrationCode: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(),
      updateAvatar: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('renders the brand shell and login form', () => {
    render(<LoginPage />);

    expect(screen.getByText('LiYuan Studio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /LiYuan Studio/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<LoginPage />);

    await expectNoAccessibilityViolations(container);
  });

  it('redirects authenticated visitors home without rendering the authenticated card', async () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: 'authenticated',
        user: { id: '1', email: 'hello@example.com', displayName: 'Hello', role: 'tourist' },
      },
      login: vi.fn(),
      sendRegistrationCode: vi.fn(),
      verifyRegistrationCode: vi.fn(),
      logout: vi.fn(),
      updateAvatar: vi.fn(),
      updateProfile: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        set href(value: string) {
          hrefSetter(value);
        },
        get href() {
          return hrefSetter.mock.calls.at(-1)?.[0] ?? '';
        },
      },
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(hrefSetter).toHaveBeenCalledWith('/');
    });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('redirects home after a successful login', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
      login,
      sendRegistrationCode: vi.fn(),
      verifyRegistrationCode: vi.fn(),
      logout: vi.fn(),
      updateAvatar: vi.fn(),
      updateProfile: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        set href(value: string) {
          hrefSetter(value);
        },
        get href() {
          return hrefSetter.mock.calls.at(-1)?.[0] ?? '';
        },
      },
    });

    render(<LoginPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('邮箱'), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('hello@example.com', 'password123');
      expect(hrefSetter).toHaveBeenCalledWith('/');
    });
  });
});
