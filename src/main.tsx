import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './app';
import { loadSnapshot } from './lib/boards';

// 预热每日快照:进榜单/看板时直接命中,不必等首屏请求
void loadSnapshot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA:仅生产环境注册 Service Worker;失败不影响正常使用
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(__APP_VERSION__)}`)
      .catch(() => {
        /* 静态托管不支持 SW 或被策略拦截时静默降级 */
      });
  });
}
