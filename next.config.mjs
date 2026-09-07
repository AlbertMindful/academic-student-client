/** @type {import('next').NextConfig} */
const appPages = [
  "/dashboard",
  "/activity",
  "/schedule",
  "/todos",
  "/grades",
  "/exams",
  "/insights",
  "/data",
  "/login",
];

const nextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      ...appPages.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      })),
    ];
  },
};

export default nextConfig;
