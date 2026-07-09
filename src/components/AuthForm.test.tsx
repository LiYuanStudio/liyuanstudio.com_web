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
    login: vi.fn().mockResolvedValue(null),
    completeLoginTwoFactor: vi.fn().mockResolvedValue(undefined),
    resendLoginTwoFactor: vi.fn().mockResolvedValue(undefined),
    beginTwoFactorAction: vi.fn().mockResolvedValue(undefined),
    confirmTwoFactorAction: vi.fn().mockResolvedValue(null),
    sendRegistrationCode: vi.fn().mockResolvedValue(undefined),
    verifyRegistrationCode: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    updateAvatar: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('renders login form by default', () => {
    mockUseAuth.mockReturnValue(unauthMock() as ReturnType<typeof useAuth>);
    render(<AuthForm />);

    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '忘记密码？' })).toHaveAttribute('href', '/forgot-password/');
  });

  it('toggles to register mode', async () => {
    mockUseAuth.mockReturnValue(unauthMock() as ReturnType<typeof useAuth>);
    render(<AuthForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '去注册' }));

    expect(screen.getByRole('heading', { name: '注册' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '获取验证码' })).toBeInTheDocument();
  });

  it('submits login and calls onSuccess', async () => {
    const login = vi.fn().mockResolvedValue(null);
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

  it('completes an email two-factor login challenge', async () => {
    const login = vi.fn().mockResolvedValue({
      twoFactorRequired: true,
      challengeToken: 'challenge-token',
      emailHint: 'he***@example.com',
    });
    const completeLoginTwoFactor = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    mockUseAuth.mockReturnValue(
      unauthMock({ login, completeLoginTwoFactor }) as ReturnType<typeof useAuth>,
    );
    render(<AuthForm onSuccess={onSuccess} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('邮箱'), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));
    await screen.findByText(/he\*\*\*@example.com/);
    await user.type(screen.getByLabelText('验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '验证并登录' }));

    await waitFor(() => {
      expect(completeLoginTwoFactor).toHaveBeenCalledWith(
        'challenge-token',
        { code: '123456' },
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('submits register code form and shows code verification step', async () => {
    const sendRegistrationCode = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue(
      unauthMock({ sendRegistrationCode }) as ReturnType<typeof useAuth>,
    );
    render(<AuthForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '去注册' }));
    await user.type(screen.getByLabelText('显示名称'), 'New User');
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    await waitFor(() => {
      expect(sendRegistrationCode).toHaveBeenCalledWith('new@example.com', 'password123', 'New User');
      expect(screen.getByLabelText('验证码')).toBeInTheDocument();
      expect(screen.getByText(/验证码已发送至 new@example.com/)).toBeInTheDocument();
    });
  });

  it('submits verification code and calls onSuccess', async () => {
    const sendRegistrationCode = vi.fn().mockResolvedValue(undefined);
    const verifyRegistrationCode = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    mockUseAuth.mockReturnValue(
      unauthMock({ sendRegistrationCode, verifyRegistrationCode }) as ReturnType<typeof useAuth>,
    );
    render(<AuthForm onSuccess={onSuccess} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '去注册' }));
    await user.type(screen.getByLabelText('显示名称'), 'New User');
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    await waitFor(() => {
      expect(screen.getByLabelText('验证码')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '完成注册' }));

    await waitFor(() => {
      expect(verifyRegistrationCode).toHaveBeenCalledWith('new@example.com', '123456');
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
      expect(screen.getByRole('button', { name: '处理中...' })).toBeDisabled();
    });

    resolveLogin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    });
  });

  it('renders authenticated state', () => {
    mockUseAuth.mockReturnValue(
      unauthMock({
        state: { status: 'authenticated', user: { id: '1', email: 'me@example.com', displayName: 'Me', role: 'tourist', emailVerified: true } },
      }) as ReturnType<typeof useAuth>,
    );
    render(<AuthForm />);

    expect(screen.getByRole('heading', { name: '已登录' })).toBeInTheDocument();
    expect(screen.getByText('Me')).toBeInTheDocument();
  });
});
