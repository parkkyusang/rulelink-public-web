import type {NextConfig} from 'next';

import {publicSecurityHeaderRules} from './src/lib/public-security-headers';

const nextConfig: NextConfig = {
  distDir: process.env.RULELINK_EDITORIAL_PREVIEW_MODE === 'true'
    ? '.next-editorial-preview'
    : process.env.RULELINK_PUBLIC_BUILD_CHECK === 'true'
      ? '.next-build-check'
      : '.next',
  reactStrictMode: true,
  devIndicators: false,
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{type: 'host', value: 'www.rule-link.com'}],
        destination: 'https://rule-link.com/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{type: 'host', value: 'rule.ai.kr'}],
        destination: 'https://rule-link.com/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{type: 'host', value: 'rulelink.lolphysical.xyz'}],
        destination: 'https://rule-link.com/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return publicSecurityHeaderRules();
  },
};

export default nextConfig;
