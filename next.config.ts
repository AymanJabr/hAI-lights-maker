import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // headers: async () => {
  //   return [
  //     {
  //       source: "/:path*",
  //       headers: [
  //         {
  //           key: "Cross-Origin-Embedder-Policy",
  //           value: "require-corp",
  //         },
  //         {
  //           key: "Cross-Origin-Opener-Policy",
  //           value: "same-origin",
  //         },
  //       ],
  //     },
  //   ];
  // },
  webpack: (config) => {
    // Support for WebAssembly
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    return config;
  },
};

export default nextConfig;
