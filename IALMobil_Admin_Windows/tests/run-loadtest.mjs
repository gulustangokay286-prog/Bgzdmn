
import { register } from 'node:module';
register('./vite-resolve-hook.mjs', import.meta.url);
await import('./loadtest-attendance.mjs');
