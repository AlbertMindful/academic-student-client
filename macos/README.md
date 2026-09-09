# 学业中心 for macOS

这是现有学业中心的轻量原生 macOS 外壳，使用系统 WebKit 打开线上服务。

## 功能

- 保留网页登录状态与跨设备同步
- 支持云盘文件上传、课程表/考试导出与普通下载
- `⌘1` 打开今天、`⌘2` 打开课表、`⌘3` 打开待办、`⌘R` 重新载入
- 同时支持 Apple 芯片与 Intel Mac，要求 macOS 14 或更高版本

## 构建

在仓库根目录运行：

```bash
zsh macos/build.sh
```

安装镜像会生成在 `macos/dist/AcademicCenter-macOS.dmg`。

当前自动生成的是本机使用的临时签名版本。若要公开分发且不出现 Gatekeeper 提示，需要使用 Apple Developer Program 的 Developer ID 证书重新签名并提交 Apple 公证。
