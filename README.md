# 学业中心

一个面向学生的个人学业信息中心，将教务系统和学习通里的课程、考试、成绩、作业与通知整理到同一个页面。

在线使用：[academic-student-client.43-132-136-104.sslip.io](https://academic-student-client.43-132-136-104.sslip.io)

## 能做什么

- 汇总今天的课程、近期考试、作业截止时间和重要通知
- 自动同步教务系统与学习通，并保留最近一次有效结果
- 合并不同来源里描述同一件事的信息，发生冲突时以教务系统为准
- 支持已读、完成、忽略和置顶等本地状态
- 支持亮色、暗色、手机浏览器和 PWA 安装
- 提供登录后可跨设备访问的个人云盘，文件保存在自己的服务器上
- 登录失效时给出重新绑定入口，不会展示已解绑账号的旧数据
- 提供带桌面小组件的原生 macOS 安装版

## macOS 应用

原生应用同时支持 Apple 芯片与 Intel Mac，要求 macOS 14 或更高版本。它保留网页登录状态，支持云盘上传下载、课程表和考试导出，并附带小号与中号桌面小组件。

构建与签名说明见 [`macos/README.md`](macos/README.md)。

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
cp .env.example .env.local
npm run dev
```

默认使用演示数据。需要连接真实教务系统时，将 `.env.local` 中的 `ACADEMIC_DATA_SOURCE` 改为 `real`，并设置安全的 `ACADEMIC_SESSION_SECRET`。完整配置见 [`.env.example`](.env.example)。

## 数据与安全

- 只读取当前用户本来有权访问的信息
- 不实现自动签到、刷课、答题、考试或作业提交
- 学校 Cookie 和登录凭据不会暴露给前端，也不会写入日志或提交到 Git
- 账号主动解绑或发生切换时，会移除该来源在当前设备上的旧缓存

## 部署

仓库包含 [`render.yaml`](render.yaml)，可以通过 Render Blueprint 部署。生产环境必须配置独立且足够长的 `ACADEMIC_SESSION_SECRET`。

云盘默认限制为 8GB、单文件 200MB，并为系统保留至少 8GB 可用空间。生产环境请将 `DRIVE_STORAGE_PATH` 指向服务器持久目录，相关容量参数见 [`.env.example`](.env.example)。

## 开源协议

项目使用 [MIT License](LICENSE)。使用时请遵守学校平台的用户协议和相关规定。
