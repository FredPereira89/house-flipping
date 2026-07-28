/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // This repo pins TypeScript 7 (the Go-based compiler), which does not
    // yet expose the classic TS Program API Next.js's built-in typechecker
    // relies on. This flag switches Next.js to shell out to `tsc` instead.
    // See: https://nextjs.org/docs/messages/typescript-cli
    useTypeScriptCli: true,
  },
};

module.exports = nextConfig;