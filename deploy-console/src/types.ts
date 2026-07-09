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

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin';
};

export type Session = {
  token: string;
  user: AdminUser;
  csrf: string;
  expiresAt: number;
};

export type GrayDeployment = {
  id: number;
  sha: string;
  createdAt: string;
  state: string;
  upstreamUrl: string | null;
  promotionState: string | null;
  promoted: boolean;
};
