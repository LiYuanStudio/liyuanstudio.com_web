import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth } from '../context/AuthContext.js';
import { RegisterPage } from './RegisterPage.js';

vi.mock('../context/AuthContext.js');

const mockUseAuth = vi.mocked(useAuth);

describe('RegisterPage', () => {
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
    } as ReturnType<typeof useAuth>);
  });

  it('renders the brand shell and register form without mode switch', () => {
    render(<RegisterPage />);

    expect(screen.getByText('LiYuan Studio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /LiYuan Studio/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { name: '注册' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登录' })).not.toBeInTheDocument();
  });

  it('redirects home after successful registration verification', async () => {
    const sendRegistrationCode = vi.fn().mockResolvedValue(undefined);
    const verifyRegistrationCode = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
      login: vi.fn(),
      sendRegistrationCode,
      verifyRegistrationCode,
      logout: vi.fn(),
      updateAvatar: vi.fn(),
      updateProfile: vi.fn(),
    } as ReturnType<typeof useAuth>);

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

    render(<RegisterPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('显示名称'), 'Hello');
    await user.type(screen.getByLabelText('邮箱'), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    await waitFor(() => {
      expect(sendRegistrationCode).toHaveBeenCalled();
    });

    await user.type(screen.getByLabelText('验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '完成注册' }));

    await waitFor(() => {
      expect(verifyRegistrationCode).toHaveBeenCalledWith('hello@example.com', '123456');
      expect(hrefSetter).toHaveBeenCalledWith('/');
    });
  });
});
