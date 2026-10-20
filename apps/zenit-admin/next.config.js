/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@zenit/shared-users-core', '@zenit/product-attributes'],
  experimental: {
    externalDir: true
  }
};

module.exports = nextConfig;
