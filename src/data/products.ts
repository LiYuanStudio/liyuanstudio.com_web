export type ProductLinkKind = 'internal' | 'external';

export interface ProductSummary {
  name: string;
  eyebrow: string;
  description: string;
  href: string;
  linkKind: ProductLinkKind;
  actionLabel: string;
  tone: 'blue' | 'green' | 'orange';
}

export const PRODUCTS: ProductSummary[] = [
  {
    name: 'Papyrus Desktop',
    eyebrow: '桌面应用',
    description: '由简入深，为专注创作与知识整理打造的桌面工作空间。',
    href: '/products/papyrusdesktop/',
    linkKind: 'internal',
    actionLabel: '查看详情',
    tone: 'blue',
  },
  {
    name: 'Papyrus',
    eyebrow: '开源核心',
    description: '随手随学，让内容、灵感与知识之间的连接更自由。',
    href: 'https://github.com/PapyrusOR/Papyrus',
    linkKind: 'external',
    actionLabel: '前往 GitHub',
    tone: 'green',
  },
  {
    name: 'Papyrus CLI',
    eyebrow: '命令行工具',
    description: '为自动化、终端工作流和更轻量的内容操作准备。',
    href: 'https://github.com/PapyrusOR/Papyrus_CLI',
    linkKind: 'external',
    actionLabel: '前往 GitHub',
    tone: 'orange',
  },
];
