export type DeploymentStatus = {
  id: number;
  sha: string;
  state: string;
  promotionState: string | null;
  promotionDescription?: string | null;
  promoted: boolean;
  previewUrl: string | null;
};

export type LastPromotionStatus = {
  deploymentId: number;
  sha: string;
  dispatchedAt: number;
  state: string | null;
  description: string | null;
};

export type DeploymentView = {
  promoting: boolean;
  ready: boolean;
  statusText: string;
  badge: 'success' | 'warning' | 'danger';
  message: string;
  promoteDisabled: boolean;
};

export function deploymentKey(
  deployment: Pick<DeploymentStatus, 'id' | 'sha'> | Pick<LastPromotionStatus, 'deploymentId' | 'sha'>,
): string {
  if ('deploymentId' in deployment) {
    return String(deployment.deploymentId) + ':' + deployment.sha;
  }
  return String(deployment.id) + ':' + deployment.sha;
}

export function isActivePromotionState(state: string | null | undefined): boolean {
  return state === 'pending' || state === 'in_progress';
}

export function isFailedPromotionState(state: string | null | undefined): boolean {
  return state === 'failure' || state === 'error';
}

export function isPartialPromotion(description: string | null | undefined): boolean {
  return typeof description === 'string' && /\bpartial:/i.test(description);
}

export function deriveDeploymentView(
  deployment: DeploymentStatus,
  submitting: boolean,
  submittedDeployment: string | null,
  lastPromotion: LastPromotionStatus | null = null,
): DeploymentView {
  const labels: Record<string, string> = {
    success: '灰度可用',
    pending: '等待构建',
    in_progress: '构建中',
    failure: '构建失败',
    error: '构建异常',
    inactive: '已停用',
    queued: '排队中',
  };
  const currentKey = deploymentKey(deployment);
  const promoting = isActivePromotionState(deployment.promotionState) ||
    submittedDeployment === currentKey;
  const ready = deployment.state === 'success' && Boolean(deployment.previewUrl);
  const crossCandidate = Boolean(
    lastPromotion && deploymentKey(lastPromotion) !== currentKey,
  );
  const lastFailed = Boolean(
    lastPromotion && (
      isFailedPromotionState(lastPromotion.state) ||
      isPartialPromotion(lastPromotion.description)
    ),
  );
  const partial = isPartialPromotion(
    deployment.promotionDescription ?? lastPromotion?.description,
  );

  let message = deployment.state === 'success'
    ? deployment.promoted
      ? '该版本已经完成全量发布。'
      : promoting
        ? '生产工作流正在运行，请勿重复提交。'
        : '请检查灰度版本，确认无误后再全量发布。'
    : '最新灰度构建尚未成功，不能验收或发布。';

  if (lastFailed && lastPromotion) {
    const shortSha = lastPromotion.sha.slice(0, 7);
    const when = new Date(lastPromotion.dispatchedAt).toLocaleString('zh-CN');
    if (crossCandidate) {
      message = partial
        ? `上一候选 ${shortSha} 于 ${when} 发布部分失败且未完全回滚；当前显示最新灰度。`
        : `上一候选 ${shortSha} 于 ${when} 全量发布失败或已取消；当前显示最新灰度。`;
    } else if (!promoting) {
      message = partial
        ? `该版本全量发布部分失败（${lastPromotion.description}）。请按文档执行人工恢复后再重试。`
        : '全量发布失败或已取消，可在修复后重新提交。';
    }
  }

  return {
    promoting,
    ready,
    statusText: deployment.promoted
      ? '已全量发布'
      : promoting ? '全量发布中' : (labels[deployment.state] || '状态未知'),
    badge: deployment.promoted || deployment.state === 'success'
      ? 'success'
      : promoting || deployment.state === 'pending' || deployment.state === 'queued'
        ? 'warning'
        : 'danger',
    message,
    promoteDisabled: submitting || !ready || deployment.promoted || promoting,
  };
}

export function shouldApplyPoll(sequence: number, latestSequence: number): boolean {
  return sequence === latestSequence;
}

export function pollErrorMessage(hasLastGoodState: boolean, error: string): string {
  return error + (hasLastGoodState ? '；继续显示上次成功读取的状态。' : '');
}
