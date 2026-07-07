import { createConfiguredWebAPIs } from './runtimeConfig';
import type { RuntimeAPIs } from '@ocelot/ui/lib/api/types';
import '@ocelot/ui/index.css';
import '@ocelot/ui/styles/fonts';

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

window.__OPENCHAMBER_RUNTIME_APIS__ = createConfiguredWebAPIs();

void import('@ocelot/ui/apps/renderMobileApp')
  .then(({ renderMobileApp }) => {
    renderMobileApp(window.__OPENCHAMBER_RUNTIME_APIS__ ?? createConfiguredWebAPIs());
  });
