import { AuthForm } from '../components/AuthForm.js';
import './login.css';

export function LoginPage() {
  return (
    <div className="login-page">
      <nav className="login-nav">
        <a className="login-brand" href="/">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
      </nav>

      <main className="login-main">
        <AuthForm
          onSuccess={() => {
            window.location.href = '/';
          }}
        />
      </main>
    </div>
  );
}
