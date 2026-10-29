export function publicationMessage(immediateMessage: string): string {
  return import.meta.env.VITE_STATIC_SITE_ENABLED === 'true'
    ? '修改已保存，等待官网自动更新。'
    : immediateMessage;
}
