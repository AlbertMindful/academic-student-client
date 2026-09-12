# 学业中心：AI 接手说明

> 最后更新：2026-09-12（Asia/Shanghai）  
> 本地仓库：`/Users/will/Code/academic-student-client`  
> GitHub：`https://github.com/AlbertMindful/academic-student-client`  
> 生产地址：`https://academic-student-client.43-132-136-104.sslip.io`

## 1. 项目目标与不可偏离的原则

这是一个面向学生的个人学业信息中心，把学校教务系统和学习通中的课程、考试、成绩、作业、通知等内容统一整理，并提供跨设备状态同步和个人云盘。

用户反复强调的产品原则：

- 简约、美观、方便，功能增加不能破坏原有的简单易用性。
- 只读取和整理用户本来有权访问的数据。
- 不做自动签到、刷课、答题、考试、作业提交或群聊编辑。
- 凭据、Cookie、Token、聊天内容不得写入日志、提交 Git 或显示给前端。
- UI 改动应延续现有视觉语言，避免复杂控制和信息堆叠。

## 2. 技术栈和结构

- Next.js 15 App Router、React 19、TypeScript、Tailwind CSS、Radix UI。
- 同一个 Next.js 项目同时承载前端页面和服务端 API。
- PostgreSQL（当前采用 Neon 连接方式）保存跨设备事件状态。
- macOS 客户端是 SwiftUI + `WKWebView` 的轻量原生外壳，不是完整原生重写。
- macOS 14+；构建脚本为 `macos/build.sh`。

主要目录：

- `src/app/(app)/`：登录后的页面。
- `src/app/api/`：服务端 API。
- `src/server/adapters/`：教务数据适配与解析。
- `src/server/auth/`：登录、会话、凭据加密和 Cookie 管理。
- `src/server/chaoxing/`：学习通连接与会话。
- `src/server/database.ts`：跨设备状态表和读写逻辑。
- `src/server/drive.ts`：个人云盘容量、文件和磁盘保护逻辑。
- `src/lib/academic-store.ts`、`src/hooks/use-academic-center.ts`：前端聚合状态和同步。
- `macos/`：macOS App、曾经实现的小组件及构建资源。

## 3. 已实现功能

- 教务系统登录、短信/验证码流程、会话保持。
- 课程表、考试、成绩、待办、动态、学业洞察。
- 课程表和考试导出。
- 学习通绑定与数据读取。
- 完成、已读、忽略、置顶状态跨设备同步。
- 个人云盘上传、下载和删除。
- PWA、响应式布局、亮色/暗色主题。
- macOS WebView 客户端和安装镜像构建。

## 4. 数据和安全模型

### 4.1 登录与凭据

- 浏览器使用服务端签发的 `academic_session` HttpOnly Cookie。
- 生产环境需要足够长且独立的 `ACADEMIC_SESSION_SECRET`。
- 学校登录凭据与学习通会话仅在服务端处理。
- 不要打印请求体、Cookie、账号、密码、解密结果或访问 Token。

### 4.2 跨设备状态数据库

`src/server/database.ts` 会自动创建：

```sql
academic_event_states (
  owner_key TEXT,
  event_id TEXT,
  state JSONB,
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (owner_key, event_id)
)
```

`owner_key` 是基于账号身份和会话密钥生成的 HMAC，不保存原始学号或用户名。数据库仅保存事件 ID 和本地处理状态，不保存平台凭据。

此前出现过“作业或动态勾选完成后又回来”的问题。提交 `63a2f35` 完成了第一轮修复；2026-09-12 又发现并修复了三个更深层原因：上游 ID 变化后的状态被历史内容初始化覆盖、通知/资料类动态没有参与 ID 延续、云端旧请求晚到时会覆盖新请求。相关本地修改位于 `src/lib/academic-store.ts` 和 `src/server/database.ts`，部署后仍需做跨设备和跨日期回归测试。

### 4.3 云盘

默认参数：

- 用户总容量：8 GiB。
- 单文件：200 MiB。
- 始终为系统保留至少 8 GiB 可用空间。
- 生产存储路径：`/var/lib/academic-student-drive`（以服务器实际环境变量为准）。

## 5. 环境变量

完整且不含真实密钥的模板见 `.env.example`。关键项：

- `ACADEMIC_DATA_SOURCE=real`
- `ACADEMIC_SESSION_SECRET`
- `ACADEMIC_COOKIE_SECURE=true`
- `DATABASE_URL`
- `ACADEMIC_SESSION_TTL_MS`
- `ACADEMIC_CREDENTIAL_TTL_MS`
- `CHAOXING_SESSION_TTL_MS`
- `DRIVE_STORAGE_PATH`
- `DRIVE_QUOTA_BYTES`
- `DRIVE_RESERVE_BYTES`
- `DRIVE_MAX_FILE_BYTES`

不要把生产 `.env` / `.env.local` 内容复制到对话或提交到仓库。需要核对时，只检查变量是否存在，不输出值。

## 6. 生产环境与部署

- 腾讯云轻量应用服务器（Lighthouse）。
- 实例：`lhins-2jvwtazt`。
- 区域：香港 `ap-hongkong`。
- 公网 IP：`43.132.136.104`。
- 项目目录：`/home/ubuntu/academic-student-client`。
- 使用 `sslip.io` 域名和 HTTPS；香港服务器不依赖中国大陆 ICP 备案。
- Next 服务监听 `127.0.0.1:3000`，外部入口由服务器现有反向代理提供。

部署必须先进入项目目录，不能在 `/home/ubuntu` 直接运行：

```bash
cd /home/ubuntu/academic-student-client
git pull --ff-only origin main
npm run build
```

构建成功后，先检查进程：

```bash
ps -ef | grep '[n]ext'
```

当前服务器上的 `npm run start` 会自动重新拉起。应只终止检查到的准确进程链（`npm run start`、`sh -c next start ...`、`next-server`），不要使用可能误伤终端或其他服务的宽泛命令。重启后验证：

- 首页及登录后主要页面能打开。
- `/api/auth/session` 等需要登录的接口行为正常。
- 未登录访问受保护接口返回 401 属于正常结果。
- 云盘持久目录仍存在且容量保护生效。

服务器日志目前按既有方式写在项目目录下的 `app.log`；诊断学习通时可使用：

```bash
cd /home/ubuntu/academic-student-client
tail -n 100 app.log
```

不要在对话中粘贴可能含凭据的完整日志，只提取经过检查的安全字段。

## 7. 已撤销的学习通群聊功能

学习通网页版只返回脱敏后的群聊密码，无法通过安全、稳定的方式获取只读群聊数据。用户已决定删除该功能。群聊页面、导航入口、接口、下载代理、协议实现和专用类型均已移除；不要在没有新的官方网页接口时恢复它。课程、作业、考试等现有学习通同步不受影响。

## 8. macOS 客户端状态

- 客户端本质是线上系统的 `WKWebView` 外壳，会保留网页登录状态并处理上传、下载和导出。
- “每次打开都申请访问其他应用数据”的问题已由 `bdfe09e fix: remove macOS shared data permission` 处理。
- 小组件曾实现今日摘要，但用户已经明确决定“暂时先不要小组件”。不要主动继续证书或小组件工作，除非用户重新提出。
- 现有证书曾出现 `Not in Keychain` 和免费开发证书额度/待处理请求问题；这不是当前优先事项。
- 本机构建：`zsh macos/build.sh`，输出 `macos/dist/AcademicCenter-macOS.dmg`。
- 当前自动构建为本机临时签名。公开分发和 Apple 公证需要付费 Apple Developer Program 的 Developer ID 证书。

## 9. 当前 Git 状态与文件归属

撰写本文档前的基线：

- 分支：`main`。
- `origin/main` 和本地已提交 HEAD：`0402ca8`。
- 学习通安全诊断已在 `67ccb38` 提交，云盘 Range 下载修复已在 `0402ca8` 提交。
- 已修改但未提交：`src/lib/academic-store.ts`、`src/server/database.ts`（状态一致性修复）。
- 新增：本说明文件 `AI_HANDOFF.md`。
- 未跟踪：`.codex-pet-repairs/`、`.codex-pet-runs/`，属于用户已有内容，不要修改、删除或提交。
- 未跟踪：`androguard.db`，由此前 APK 分析工具生成，不属于产品代码，不要提交；确认无需继续 APK 分析后可删除。

提交时要精确 `git add`，不要使用会把所有未跟踪目录一起加入的命令。例如：

```bash
git add src/lib/academic-store.ts src/server/database.ts AI_HANDOFF.md
git commit -m "fix: keep activity states consistent across syncs"
git push origin main
```

Git 推送在自动化环境中曾多次因权限确认超时失败；必要时让用户在自己的终端执行上述明确命令。不要重复创建提交，也不要强推。

## 10. 常用验证

```bash
cd /Users/will/Code/academic-student-client
npm install
npm run build
git status --short --branch
```

当前 `package.json` 的 `lint` 脚本为 `next lint`，而 Next.js 15/当前配置下不一定是可靠入口；以生产构建中的 TypeScript 和编译检查为最低验收标准，再针对改动做页面/API 实测。

重点回归路径：

- 登录、退出和会话保持。
- 首页、课程表、待办、考试和成绩。
- 完成作业后刷新、隔天及跨设备不应重新出现。
- 学习通重新绑定及连接过期提示。
- 云盘上传、下载、删除、配额和磁盘保留空间。
- macOS App 内上传下载、课程表/考试导出，不应重复申请跨应用数据权限。

## 11. 协作边界

- 用户要求服务器操作由本人执行；只提供经过核对的部署步骤，不直接操作腾讯云服务器。
- 付款、购买、账号验证、验证码和敏感登录步骤应交给用户本人完成。
- 修改生产前先本地构建；部署后必须做真实页面验证。
- 不要清理用户的未跟踪文件，不要 `git reset --hard`，不要强推。
- 说明结果时以用户能看到的行为为准，不要仅凭构建或进程启动就宣告功能成功。
