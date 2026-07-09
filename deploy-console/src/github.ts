import type { AdminUser, Bindings, GrayDeployment } from './types.js';

type GitHubDeployment = {
  id: number;
  sha: string;
  created_at: string;
};

type GitHubDeploymentStatus = {
  state: string;
  environment_url: string | null;
};

async function githubRequest<T>(
  env: Bindings,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'liyuanstudio-deploy-console',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const requestId = response.headers.get('x-github-request-id');
    throw new Error(`GitHub API returned ${response.status}${requestId ? ` (${requestId})` : ''}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function repositoryPath(env: Bindings): string {
  return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
}

async function latestStatus(
  env: Bindings,
  deploymentId: number,
): Promise<GitHubDeploymentStatus | null> {
  const statuses = await githubRequest<GitHubDeploymentStatus[]>(
    env,
    `${repositoryPath(env)}/deployments/${deploymentId}/statuses?per_page=1`,
  );
  return statuses[0] ?? null;
}

async function wasPromoted(env: Bindings, sha: string): Promise<boolean> {
  const deployments = await githubRequest<GitHubDeployment[]>(
    env,
    `${repositoryPath(env)}/deployments?environment=production&sha=${encodeURIComponent(sha)}&per_page=10`,
  );
  for (const deployment of deployments) {
    if ((await latestStatus(env, deployment.id))?.state === 'success') return true;
  }
  return false;
}

export async function getLatestGrayDeployment(
  env: Bindings,
): Promise<GrayDeployment | null> {
  const deployments = await githubRequest<GitHubDeployment[]>(
    env,
    `${repositoryPath(env)}/deployments?environment=gray&per_page=1`,
  );
  const deployment = deployments[0];
  if (!deployment) return null;

  const status = await latestStatus(env, deployment.id);
  return {
    id: deployment.id,
    sha: deployment.sha,
    createdAt: deployment.created_at,
    state: status?.state ?? 'pending',
    upstreamUrl: status?.environment_url ?? null,
    promoted: await wasPromoted(env, deployment.sha),
  };
}

export async function dispatchPromotion(
  env: Bindings,
  deployment: GrayDeployment,
  approver: AdminUser,
): Promise<void> {
  await githubRequest<void>(
    env,
    `${repositoryPath(env)}/actions/workflows/${encodeURIComponent(env.PROMOTE_WORKFLOW)}/dispatches`,
    {
      method: 'POST',
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          deployment_id: String(deployment.id),
          sha: deployment.sha,
          approved_by: `${approver.email} (${approver.id})`,
        },
      }),
    },
  );
}
