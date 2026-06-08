/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // v0 还没配 ESLint，先让 Vercel build 不被 lint 阻断；后续可加 eslint.config.mjs
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
