import { createContext, useContext } from 'react';
import type { PublicContent } from '../../server/src/lib/public-content.js';

export interface StaticSiteState {
  content: PublicContent;
  pathname: string;
}

export const StaticSiteContext = createContext<StaticSiteState | null>(null);
export const useStaticSite = () => useContext(StaticSiteContext);
