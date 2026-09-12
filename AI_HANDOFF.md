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
- `src/server/chaoxing/`：学习通连接、会话及群聊读取。
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
- 只读学习通群聊页面及文件下载接口，但当前生产环境仍未成功取到群列表，详见第 7 节。

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

## 7. 当前最重要的未完成事项：学习通群聊

### 7.1 用户期望

在系统中查看学习通群聊消息并下载群文件。功能必须只读，不提供发消息、编辑或删除能力。

页面及接口已经存在：

- 页面：`src/app/(app)/messages/page.tsx`
- 群列表：`src/app/api/chaoxing/chats/route.ts`
- 群详情：`src/app/api/chaoxing/chats/[groupId]/route.ts`
- 下载代理：`src/app/api/chaoxing/chats/download/route.ts`
- 核心协议：`src/server/chaoxing/chat.ts`
- 类型：`src/lib/chaoxing-chat-types.ts`

已上线相关提交（从早到晚）：

- `ad07bb4 feat: add read-only Chaoxing group messages`
- `9017bc8 fix: support current Chaoxing IM authentication`
- `af1c105 fix: decrypt current Chaoxing IM credentials`
- `0f9207f fix: accept current Chaoxing group formats`
- `cd2fec6 fix: authenticate Chaoxing IM with UID`
- `1ae872e fix: send numeric UID to Chaoxing IM`

生产环境当前仍显示“学习通群聊目前正在维护，请稍后再试”。这不是页面缓存问题，而是 `modernImCredentials()` 返回 `null` 后回退到已经停用的旧网页接口，旧接口返回维护提示。

### 7.2 已确认的当前学习通 IM 协议

依据当前学习通 Android 客户端（参考 APK：ChaoxingSignFaker 1.18.1-stable，分析日期 2026-09-10）：

1. 用户信息：`https://sso.chaoxing.com/apis/login/userLogin4Uname.do`
2. 响应中使用 `msg.uid`（整数）作为环信登录用户名。
3. 加密密码位于 `msg.accountInfo.imAccount.password`。
4. 密码算法：`DES/ECB/PKCS5Padding`，密钥 `SL2(M/eD`，密文为十六进制。
5. Token 地址：`https://a1-vip6.easemob.com/cx-dev/cxstudy/token`
6. 请求头包含：
   - `Content-Type: application/x-www-form-urlencoded`
   - `User-Agent: Easemob-SDK(Android) 4.9.0.1`
7. 请求体实际上是 JSON：`grant_type=password`、数字类型 `username=msg.uid`、解密后的 `password`。
8. Token 响应使用 `access_token` 和 `user.username`。
9. 群列表：`/users/{user.username}/joined_chatgroups?detail=true&version=v3&pagenum=1&pagesize=200`
10. 群列表位于顶层 `data` 数组；群 ID 为 `id`；名称优先 `name`，可回退到 `description` JSON 中的 `courseInfo.coursename`。

当前实现已经覆盖以上大部分格式，因此需要通过安全诊断确认到底失败在用户信息、解密、Token 请求还是 Token 响应解析。

### 7.3 已提交的安全诊断

提交 `67ccb38` 已在 `src/server/chaoxing/chat.ts` 中加入前缀为 `[chaoxing-im]` 的安全诊断。它只记录：

- 各级 JSON 对象的键名。
- HTTP 状态和 Content-Type。
- 用户名/密码字段是否存在、字段类型及长度。
- 密文是否为十六进制。
- Token 响应对象键名。
- 异常类型和截断后的错误信息。

它不记录账号值、UID 值、Cookie、密文、明文密码、Token 或聊天内容。该提交已推送到 `origin/main`；是否已部署到生产环境需要先在服务器执行 `git rev-parse --short HEAD` 核对。

建议接手步骤：

1. 在腾讯云项目目录拉取、构建并按第 6 节重启。
2. 让已登录用户打开“学习通消息”并点击重试，以触发接口。
3. 在 `app.log` 中只检查 `[chaoxing-im]` 行。
4. 根据最后成功阶段修复：
   - `credentials-missing`：用户信息结构、登录态或密码解密问题。
   - Token 返回 400/401：请求格式、UID 类型或凭据问题。
   - `token-fields-missing`：Token 响应结构变化。
   - Token 成功后群请求失败：群接口主机、授权头或用户标识问题。
5. 修复完成后移除过于详细的临时诊断，只保留不会泄露信息的必要失败日志。
6. 只有在真实账号页面能显示群列表后才可宣告完成。

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
- 学习通群聊只读、群文件下载、登录过期和上游失败提示。

## 11. 协作边界

- 用户已明确允许针对本次学习通群聊兼容修复提交并推送 GitHub，并更新上述腾讯云服务器；不要把这份授权扩展到无关基础设施或破坏性操作。
- 付款、购买、账号验证、验证码和敏感登录步骤应交给用户本人完成。
- 修改生产前先本地构建；部署后必须做真实页面验证。
- 不要清理用户的未跟踪文件，不要 `git reset --hard`，不要强推。
- 说明结果时以用户能看到的行为为准，不要仅凭构建或进程启动就宣告功能成功。
