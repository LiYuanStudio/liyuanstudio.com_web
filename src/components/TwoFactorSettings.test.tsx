import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth } from '../context/AuthContext.js';
import { TwoFactorSettings } from './TwoFactorSettings.js';

vi.mock('../context/AuthContext.js');

const mockUseAuth = vi.mocked(useAuth);
const user = {
  id: 'user-1',
  email: 'hello@example.com',
  displayName: 'Hello',
  role: 'tourist' as const,
  twoFactorEnabled: false,
};

describe('TwoFactorSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables two-factor authentication and reveals recovery codes once', async () => {
    const beginTwoFactorAction = vi.fn().mockResolvedValue({
      challengeToken: 'challenge-token',
      message: '验证码已发送',
    });
    const confirmTwoFactorAction = vi.fn().mockResolvedValue({
      token: 'new-token',
      user: { ...user, twoFactorEnabled: true },
      recoveryCodes: ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'],
    });
    mockUseAuth.mockReturnValue({
      state: { status: 'authenticated', user },
      login: vi.fn(),
      completeLoginTwoFactor: vi.fn(),
      resendLoginTwoFactor: vi.fn(),
      beginTwoFactorAction,
      confirmTwoFactorAction,
      sendRegistrationCode: vi.fn(),
      verifyRegistrationCode: vi.fn(),
      logout: vi.fn(),
      updateAvatar: vi.fn(),
      updateProfile: vi.fn(),
    });
    render(<TwoFactorSettings user={user} />);
    const browser = userEvent.setup();

    await browser.type(screen.getByLabelText('当前密码'), 'password123');
    await browser.click(screen.getByRole('button', { name: '启用双重验证' }));
    await browser.type(await screen.findByLabelText('邮件验证码'), '123456');
    await browser.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(beginTwoFactorAction).toHaveBeenCalledWith('enable', 'password123');
      expect(confirmTwoFactorAction).toHaveBeenCalledWith(
        'enable',
        'challenge-token',
        '123456',
      );
      expect(screen.getByText('AAAA-BBBB-CCCC')).toBeInTheDocument();
      expect(screen.getByText(/只会显示这一次/)).toBeInTheDocument();
    });
  });
});
