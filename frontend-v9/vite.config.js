import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const checker = fileURLToPath(new URL('./scripts/check-typography.mjs', import.meta.url));
const projectRoot = fileURLToPath(new URL('.', import.meta.url));

function validateTypography(context) {
  try {
    execFileSync(process.execPath, [checker], { cwd: projectRoot, encoding: 'utf8' });
  } catch (error) {
    context.error(error.stdout || error.stderr || error.message);
  }
}

export default defineConfig({
  base: '/ripple-ai-assessment/',
  plugins: [{
    name: 'ripple-typography-standard',
    buildStart() { validateTypography(this); },
    handleHotUpdate(context) {
      if (/\.(css|[jt]sx?|html|svg)$/.test(context.file)) validateTypography(this);
    },
  }],
});
