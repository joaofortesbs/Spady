import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  allowedDevOrigins: [
    '.replit.dev',
    '.replit.app',
    '.spock.replit.dev',
    'localhost:5000',
  ],
};

if (process.env.NODE_ENV !== 'production') {
  const loaderPath = require.resolve('orchids-visual-edits/loader.js');
  nextConfig.turbopack = {
    rules: {
      "*.{jsx,tsx}": {
        loaders: [loaderPath],
      },
    },
  };
}

export default nextConfig;
