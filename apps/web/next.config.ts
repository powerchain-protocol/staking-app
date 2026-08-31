import type { NextConfig } from 'next';
const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@powerchain/ui'],
  async headers(){return [{source:'/:path*',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:'DENY'},
    ...(process.env.NODE_ENV==='production'?[{key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains; preload'}]:[])
  ]}]}
};
export default config;
