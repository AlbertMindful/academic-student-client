import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "教务助手",
    short_name: "教务助手",
    description: "课表、成绩、考试与学业洞察，一处查看。",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f8f9fc",
    theme_color: "#6754dc",
    categories: ["education", "productivity"],
    lang: "zh-CN",
    icons: [
      {
        src: "/icons/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "今日课表", short_name: "课表", url: "/schedule" },
      { name: "考试安排", short_name: "考试", url: "/exams" },
      { name: "学业洞察", short_name: "洞察", url: "/insights" },
    ],
  };
}
