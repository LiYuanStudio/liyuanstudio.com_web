import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestPasswordReset } from '../api/auth.js';
import { ForgotPasswordPage } from './ForgotPasswordPage.js';

vi.mock('../api/auth.js');

const mockRequestPasswordReset = vi.mocked(requestPasswordReset);

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits an email and shows the success state', async () => {
    mockRequestPasswordReset.mockResolvedValue({
      message: '如果该邮箱已注册，我们已发送重置密码链接。',
    });
    render(<ForgotPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('邮箱'), 'hello@example.com');
    await user.click(screen.getByRole('button', { name: '发送重置链接' }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('hello@example.com');
      expect(screen.getByRole('status')).toHaveTextContent('如果该邮箱已注册，我们已发送重置密码链接。');
    });
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/login/');
  });

  it('shows errors from the API', async () => {
    mockRequestPasswordReset.mockRejectedValue(new Error('邮箱格式不正确'));
    render(<ForgotPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('邮箱'), 'bad@example.com');
    await user.click(screen.getByRole('button', { name: '发送重置链接' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('邮箱格式不正确');
    });
  });
});
