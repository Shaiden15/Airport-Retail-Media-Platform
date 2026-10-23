import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import './i18n/index.ts';
import { App } from './App.tsx';
import { isRole, roleTheme } from '@dwellcast/shared';
import { applyPalette } from './theme/applyTheme.ts';

// Apply colours before first render so the page never flashes unstyled
const initialRole = window.location.pathname.split('/')[1] ?? '';
applyPalette(isRole(initialRole) ? roleTheme(initialRole) : 'dark');

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}
