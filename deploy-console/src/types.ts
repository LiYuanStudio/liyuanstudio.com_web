export type Bindings = {
  LA_API_BASE_URL: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN: string;
  PROMOTE_WORKFLOW: string;
  SESSION_SECRET: string;
  VERCEL_PROTECTION_BYPASS: string;
  CONSOLE_ORIGIN: string;
  PREVIEW_ORIGIN: string;
  COOKIE_DOMAIN?: string;
};

export type RequestVariables = {
  requestId: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: RequestVariables;
};

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin';
};

export type LastDispatch = {
  deploymentId: number;
  sha: string;
  dispatchedAt: number;
};

export type Session = {
  token: string;
  user: AdminUser;
  csrf: string;
  expiresAt: number;
  lastDispatch?: LastDispatch;
};

export type PendingChallenge = {
  challengeToken: string;
  emailHint: string;
  expiresAt: number;
};

export type GrayDeployment = {
  id: number;
  sha: string;
  createdAt: string;
  state: string;
  upstreamUrl: string | null;
  promotionState: string | null;
  promotionDescription: string | null;
  promoted: boolean;
};

export type LastPromotion = {
  deploymentId: number;
  sha: string;
  dispatchedAt: number;
  state: string | null;
  description: string | null;
};
