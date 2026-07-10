export type DeploymentStatus = {
  id: number;
  sha: string;
  state: string;
  promotionState: string | null;
  promoted: boolean;
  previewUrl: string | null;
};

export type DeploymentView = {
  promoting: boolean;
  ready: boolean;
  statusText: string;
  badge: 'success' | 'warning' | 'danger';
  message: string;
  promoteDisabled: boolean;
};

export function deploymentKey(deployment: Pick<DeploymentStatus, 'id' | 'sha'>): string {
  return String(deployment.id) + ':' + deployment.sha;
}

export function deriveDeploymentView(
  deployment: DeploymentStatus,
  submitting: boolean,
  submittedDeployment: string | null,
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
  const promoting = deployment.promotionState === 'pending' ||
    deployment.promotionState === 'in_progress' ||
    submittedDeployment === deploymentKey(deployment);
  const ready = deployment.state === 'success' && Boolean(deployment.previewUrl);
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
    message: deployment.state === 'success'
      ? deployment.promoted
        ? '该版本已经完成全量发布。'
        : promoting
          ? '生产工作流正在运行，请勿重复提交。'
          : '请检查灰度版本，确认无误后再全量发布。'
      : '最新灰度构建尚未成功，不能验收或发布。',
    promoteDisabled: submitting || !ready || deployment.promoted || promoting,
  };
}

export function shouldApplyPoll(sequence: number, latestSequence: number): boolean {
  return sequence === latestSequence;
}

export function pollErrorMessage(hasLastGoodState: boolean, error: string): string {
  return error + (hasLastGoodState ? '；继续显示上次成功读取的状态。' : '');
}
