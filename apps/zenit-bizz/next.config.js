/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  transpilePackages: ['@zenit/shared-users-core'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${(process.env.BACKEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')}/api/:path*`
      }
    ];
  }
};
