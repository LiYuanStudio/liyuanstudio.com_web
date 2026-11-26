import { IconGithub } from '@arco-design/web-react/icon';
import './SiteFooter.css';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-main">
          <div className="site-footer-brand">
            <a className="site-footer-brand-link" href="/" aria-label="LiYuan Studio 首页">
              <img src="/brand/liyuan-wordmark.svg" alt="" />
            </a>
            <p className="site-footer-tagline">打造「有生机的科技」</p>
            <div className="site-footer-socials">
              <a
                href="https://github.com/LiYuanStudio"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <IconGithub style={{ fontSize: '16px' }} />
              </a>
            </div>
          </div>

          <nav className="site-footer-nav" aria-label="页脚导航">
            <div className="site-footer-group">
              <p className="site-footer-heading">产品</p>
              <a href="/products/papyrusdesktop/">Papyrus Desktop</a>
              <a href="https://github.com/PapyrusOR/Papyrus" target="_blank" rel="noopener noreferrer">Papyrus</a>
              <a href="https://github.com/PapyrusOR/Papyrus_CLI" target="_blank" rel="noopener noreferrer">Papyrus CLI</a>
            </div>
            <div className="site-footer-group">
              <p className="site-footer-heading">内容</p>
              <a href="/release/">最新动态</a>
              <a href="/blog/">博客</a>
            </div>
          </nav>
        </div>

        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} LiYuan Studio. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
