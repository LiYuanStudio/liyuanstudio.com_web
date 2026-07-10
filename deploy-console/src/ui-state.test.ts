import { describe, expect, it } from 'vitest';
import {
  deploymentKey,
  deriveDeploymentView,
  pollErrorMessage,
  shouldApplyPoll,
  type DeploymentStatus,
} from './ui-state.js';
import { applicationScript } from './ui.js';

const ready: DeploymentStatus = {
  id: 42,
  sha: 'abc123',
  state: 'success',
  promotionState: null,
  promoted: false,
  previewUrl: 'https://gray.example.com/',
};

describe('deploy console UI state', () => {
  it('localizes deployment states and derives badge classes', () => {
    expect(deriveDeploymentView(ready, false, null)).toMatchObject({
      statusText: '灰度可用',
      badge: 'success',
      ready: true,
      promoteDisabled: false,
    });
    expect(deriveDeploymentView({ ...ready, state: 'queued', previewUrl: null }, false, null))
      .toMatchObject({ statusText: '排队中', badge: 'warning', promoteDisabled: true });
    expect(deriveDeploymentView({ ...ready, state: 'failure', previewUrl: null }, false, null))
      .toMatchObject({ statusText: '构建失败', badge: 'danger', promoteDisabled: true });
  });

  it('keeps promotion disabled while submitting and after a 202 local lock', () => {
    expect(deriveDeploymentView(ready, true, null).promoteDisabled).toBe(true);
    const locked = deriveDeploymentView(ready, false, deploymentKey(ready));
    expect(locked).toMatchObject({
      promoting: true,
      statusText: '全量发布中',
      promoteDisabled: true,
    });
    expect(deriveDeploymentView(
      { ...ready, promotionState: 'failure' },
      false,
      null,
    ).promoteDisabled).toBe(false);
  });

  it('rejects stale poll responses and preserves the last good state message', () => {
    expect(shouldApplyPoll(2, 3)).toBe(false);
    expect(shouldApplyPoll(3, 3)).toBe(true);
    expect(pollErrorMessage(true, '读取部署状态失败'))
      .toBe('读取部署状态失败；继续显示上次成功读取的状态。');
    expect(pollErrorMessage(false, '读取部署状态失败')).toBe('读取部署状态失败');
  });

  it('emits a syntactically valid standalone browser script', () => {
    expect(() => new Function(applicationScript)).not.toThrow();
  });
});
