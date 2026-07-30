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
    vi.restoreAllMocks();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
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

    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await browser.click(screen.getByRole('button', { name: '复制' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'AAAA-BBBB-CCCC\nDDDD-EEEE-FFFF',
      );
      expect(screen.getByText('恢复码已复制。')).toBeInTheDocument();
    });

    writeText.mockRejectedValueOnce(new Error('denied'));
    await browser.click(screen.getByRole('button', { name: '复制' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法自动复制，请手动保存恢复码。',
    );

    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:codes');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await browser.click(screen.getByRole('button', { name: '下载' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:codes');
  });

  it.each([
    ['recovery-codes' as const, '重新生成恢复码', '恢复码已重新生成，请立即保存。'],
    ['disable' as const, '关闭双重验证', '双重验证已关闭。'],
  ])('confirms the %s action for an enabled account', async (
    action,
    buttonName,
    successMessage,
  ) => {
    const enabledUser = { ...user, twoFactorEnabled: true };
    const beginTwoFactorAction = vi.fn().mockResolvedValue({
      challengeToken: `${action}-challenge`,
      message: '验证码已发送',
    });
    const confirmTwoFactorAction = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      state: { status: 'authenticated', user: enabledUser },
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
    render(<TwoFactorSettings user={enabledUser} />);
    const browser = userEvent.setup();

    expect(screen.getByText('已启用')).toBeInTheDocument();
    await browser.type(screen.getByLabelText('当前密码'), 'password123');
    await browser.click(screen.getByRole('button', { name: buttonName }));
    expect(await screen.findByText(new RegExp(buttonName))).toBeInTheDocument();

    if (action === 'recovery-codes') {
      await browser.click(screen.getByRole('button', { name: '取消' }));
      expect(screen.getByLabelText('当前密码')).toHaveValue('password123');
      await browser.click(screen.getByRole('button', { name: buttonName }));
    }

    await browser.type(await screen.findByLabelText('邮件验证码'), '12a34b56');
    expect(screen.getByLabelText('邮件验证码')).toHaveValue('123456');
    await browser.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(confirmTwoFactorAction).toHaveBeenCalledWith(
        action,
        `${action}-challenge`,
        '123456',
      );
      expect(screen.getByText(successMessage)).toBeInTheDocument();
      expect(screen.queryByLabelText('恢复码')).not.toBeInTheDocument();
    });
  });

  it.each([
    [new Error('密码错误'), '密码错误'],
    ['unexpected failure', '请求失败'],
  ])('shows safe begin-action errors for %p', async (failure, expectedMessage) => {
    const beginTwoFactorAction = vi.fn().mockRejectedValue(failure);
    mockUseAuth.mockReturnValue({
      state: { status: 'authenticated', user },
      login: vi.fn(),
      completeLoginTwoFactor: vi.fn(),
      resendLoginTwoFactor: vi.fn(),
      beginTwoFactorAction,
      confirmTwoFactorAction: vi.fn(),
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

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
    expect(screen.getByLabelText('当前密码')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    [new Error('验证码过期'), '验证码过期'],
    ['unexpected failure', '验证失败'],
  ])('keeps the challenge active after confirmation failure %p', async (
    failure,
    expectedMessage,
  ) => {
    const beginTwoFactorAction = vi.fn().mockResolvedValue({
      challengeToken: 'challenge-token',
      message: '验证码已发送',
    });
    const confirmTwoFactorAction = vi.fn().mockRejectedValue(failure);
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

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
    expect(screen.getByLabelText('邮件验证码')).toHaveValue('123456');
  });
});
