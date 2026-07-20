import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.RULELINK_EDITORIAL_PREVIEW_MODE === 'true'
    ? '.next-editorial-preview'
    : process.env.RULELINK_PUBLIC_BUILD_CHECK === 'true'
      ? '.next-build-check'
      : '.next',
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
