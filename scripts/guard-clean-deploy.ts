import { execFileSync } from 'node:child_process';

function git(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const porcelainStatus = git(['status', '--porcelain']);

if (porcelainStatus.length > 0) {
  const shortStatus = git(['status', '--short']);

  console.error('部署已中止：当前 Git 工作区不是干净状态。');
  console.error('请先提交、还原或手动处理以下未提交内容，再重新部署：');
  console.error(shortStatus);
  console.error('');
  console.error('为避免再次出现 Vercel gitDirty=1，生产部署不会自动 stash、reset 或删除任何文件。');

  process.exit(1);
}

const branch = git(['branch', '--show-current']) || 'detached HEAD';
const commit = git(['rev-parse', '--short', 'HEAD']);

console.log(`Git 工作区干净，可以部署。当前版本：${branch} ${commit}`);
