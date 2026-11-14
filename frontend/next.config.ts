import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:locale/dashboard/ltf/import",
        has: [{ type: "query", key: "type", value: "members" }],
        destination: "/:locale/dashboard/ltf/members/import",
        permanent: false,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@zxing/browser", "@zxing/library"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/api/**" },
      { protocol: "https", hostname: "localhost", port: "8000", pathname: "/api/**" },
      { protocol: "https", hostname: "api.ltkdf.org", pathname: "/api/**" },
    ],
  },
};

export default withNextIntl(nextConfig);
