import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetPassword } from '../api/auth.js';
import { ResetPasswordPage } from './ResetPasswordPage.js';

vi.mock('../api/auth.js');

const mockResetPassword = vi.mocked(resetPassword);

function setSearch(search: string) {
  window.history.pushState({}, '', search ? `/reset-password/${search}` : '/reset-password/');
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setSearch('');
  });

  it('shows an error when token is missing', () => {
    setSearch('');

    render(<ResetPasswordPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('重置链接缺少 token。');
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/login/');
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('submits the new password and shows success', async () => {
    setSearch('?token=plain-token');
    mockResetPassword.mockResolvedValue({ message: '密码已重置。' });
    render(<ResetPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('新密码'), 'newpassword123');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('plain-token', 'newpassword123');
      expect(screen.getByRole('status')).toHaveTextContent('密码已重置。');
    });
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute('href', '/login/');
  });

  it('shows errors from the API', async () => {
    setSearch('?token=expired-token');
    mockResetPassword.mockRejectedValue(new Error('重置链接无效或已过期'));
    render(<ResetPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('新密码'), 'newpassword123');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('重置链接无效或已过期');
    });
  });
});
