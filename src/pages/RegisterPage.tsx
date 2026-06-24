import { AuthForm } from '../components/AuthForm.js';
import './login.css';

export function RegisterPage() {
  return (
    <div className="login-page">
      <nav className="login-nav">
        <a className="login-brand" href="/">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
      </nav>

      <main className="login-main">
        <AuthForm initialMode="register" allowModeSwitch={false} />
      </main>
    </div>
  );
}
