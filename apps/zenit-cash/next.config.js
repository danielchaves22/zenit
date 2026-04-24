/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@zenit/shared-users-core'],
  experimental: {
    externalDir: true
  }
};

module.exports = nextConfig;
