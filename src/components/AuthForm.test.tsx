import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from './AuthForm.js';
import { useAuth } from '../context/AuthContext.js';

vi.mock('../context/AuthContext.js');

const mockUseAuth = vi.mocked(useAuth);

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const unauthMock = (overrides: Record<string, unknown> = {}) => ({
    state: { status: 'unauthenticated' as const },
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    updateAvatar: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('renders login form by default', () => {
    mockUseAuth.mockReturnValue(unauthMock() as ReturnType<typeof useAuth>);
    render(<AuthForm />);

    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('toggles to register mode', async () => {
    mockUseAuth.mockReturnValue(unauthMock() as ReturnType<typeof useAuth>);
    render(<AuthForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '去注册' }));

    expect(screen.getByRole('heading', { name: '注册' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
  });

  it('submits login and calls onSuccess', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    mockUseAuth.mockReturnValue(unauthMock({ login }) as ReturnType<typeof useAuth>);
    render(<AuthForm onSuccess={onSuccess} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('邮箱'), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('hello@example.com', 'password123');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('submits register and calls onSuccess', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    mockUseAuth.mockReturnValue(
      unauthMock({ register }) as ReturnType<typeof useAuth>,
    );
    render(<AuthForm onSuccess={onSuccess} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '去注册' }));
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('new@example.com', 'password123');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('displays error message on failure', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Invalid credentials'));
    mockUseAuth.mockReturnValue(unauthMock({ login }) as ReturnType<typeof useAuth>);
    render(<AuthForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('邮箱'), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'wrong');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
  });

  it('shows loading state while submitting', async () => {
    let resolveLogin: () => void = () => {};
    const login = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    mockUseAuth.mockReturnValue(unauthMock({ login }) as ReturnType<typeof useAuth>);
    render(<AuthForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('邮箱'), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '处理中…' })).toBeDisabled();
    });

    resolveLogin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    });
  });

  it('renders authenticated state', () => {
    mockUseAuth.mockReturnValue(
      unauthMock({
        state: { status: 'authenticated', user: { email: 'me@example.com' } },
      }) as ReturnType<typeof useAuth>,
    );
    render(<AuthForm />);

    expect(screen.getByRole('heading', { name: '已登录' })).toBeInTheDocument();
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
  });
});
