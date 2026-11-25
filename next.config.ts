import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/app', destination: '/app/dashboard', permanent: false },
    ];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

// `npm run build:pages` (and the Pages workflow) builds a static copy of the
// app for GitHub Pages and sets GITHUB_PAGES; nothing else reads it, so dev,
// build, start and e2e are unchanged. A static export has no server to run
// redirects, so the build script copies them into the site's 404 page instead.
// PAGES_BASE_PATH is the site's sub-path (`/<repo>`), which Next prefixes onto
// links and assets by itself.
if (process.env.GITHUB_PAGES === 'true') {
  delete nextConfig.redirects;
  Object.assign(nextConfig, {
    output: 'export',
    basePath: process.env.PAGES_BASE_PATH || undefined,
    images: { unoptimized: true },
  });
}

export default nextConfig;
