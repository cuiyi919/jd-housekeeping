# 京东家政 · 手机本地记录

从聊天“规划9月30日起最省钱的家政预约”的网页迁移，基于 Expo SDK 57、React Native 和本地 WebView。页面、图标、计算代码全部包含在项目中，不访问原网页服务器。个人记录工具，不会向京东提交实际预约。

本项目不是京东官方应用。真实记录只存储在使用者手机上，不随源代码发布。

## 免费构建 iPhone 安装包

仓库的 **Actions → Build iPhone IPA** 会在 `main` 分支代码更新后自动运行，也可点 **Run workflow** 手动运行。工作流使用 GitHub 标准 `macos-26` 机器、Xcode 26.4 和 Node 22，生成内置页面及 JavaScript 的 Release 版，无需提供 Apple ID、苹果签名证书或 Expo token。

1. 提交并推送修改到 `main`（仅修改 Markdown 文档时不自动打包）。
2. 打开 Actions 中对应的任务，等到绿色成功状态。
3. 在任务底部 Artifacts 下载 `housekeeping-iphone-编号`，解压得到 `housekeeping-unsigned.ipa`。
4. 在 Windows 的 Sideloadly 中选择 iPhone、IPA 和用于签名的 Apple 账号，安装并启用自动续签。

产物是 **尚未签名的真机 IPA**，必须经过 Sideloadly 等工具签名后安装。最低 iOS 版本为 **16.4**。首次安装需要按设备提示信任开发者并开启开发者模式。以后覆盖更新时保持同一签名账号和应用标识 `com.cuiyi919.housekeeping`，不要先删除旧 App。

Expo Go 和独立 App 的数据空间不同。首次迁移前，在 Expo Go 中导出 JSON，安装后在独立 App 中导入；给其他手机使用也采用相同方式。各手机不会自动同步记录。

公开仓库使用标准 GitHub 托管机器的构建分钟数免费，不按 App 数量或构建次数收费；仍受 GitHub 的并发、单次任务、存储及使用规则限制。本仓库仅保留构建产物7天，下载后自行留存。不要将真实备份、`.env`、证书或凭据提交到公开仓库。

以后开发其他 Expo App，可以复用 `.github/workflows/ios-ipa.yml` 和 `scripts/build-unsigned-ios.sh`；每个 App 需要自己的应用标识，并根据 Expo SDK 调整 Node/Xcode 版本。当前脚本要求项目有一个 iOS workspace 和一个共享 scheme。

参考：[GitHub 标准构建机器](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[Sideloadly 自动续签和覆盖更新](https://sideloadly.io/faq)。

## 在 iPhone 预览

1. iPhone 安装与 SDK 57 兼容的 Expo Go。
2. 手机和电脑连同一个 Wi-Fi；允许 Expo Go 访问本地网络。
3. 在本目录打开 PowerShell，运行 `npx.cmd expo login`，登录与手机 Expo Go 相同的免费 Expo 账号。
4. 双击 `启动家政.cmd`，或者运行 `npm.cmd start`。
5. 用 iPhone 相机扫描终端二维码，在 Expo Go 中打开。

如果手机 Safari 打不开电脑的 `/status` 页面，可改用 `启动家政隧道.cmd`，或者运行 `npm.cmd run start:tunnel`。这是 Expo 官方 ngrok 临时隧道，使用端口18081，手机和电脑均需联网，电脑必须保持运行。扫描这次启动产生的新二维码；旧的局域网二维码不适用。隧道地址可以从公网访问开发资源，不要广泛分享，用完在终端按 Ctrl+C 关闭。购买记录仍保存在手机，不会自动上传。

电脑同时装有 VPN 时，Expo 可能选错网络地址。必要时在 PowerShell 中用 `$env:REACT_NATIVE_PACKAGER_HOSTNAME='当前电脑的Wi-Fi地址'`，再运行 `npm.cmd start`。不要使用 Radmin/Tailscale 等虚拟网卡地址，除非手机也接入该网络。

## 离线使用的边界

- 预约计算、记录修改、费用统计、本地保存不需要业务服务器；页面所有资源已内置。
- Expo Go 是开发容器。首次加载和重新加载项目通常需要电脑上的 Metro 开发服务；不能把它当成保证离线冷启动的独立 App。
- `npm run start:offline` 只表示电脑上的 Expo CLI 不连接 Expo 服务，不代表手机脱离电脑后仍能打开项目。
- 独立 App 通过上面的 GitHub 工作流构建，再在 Windows 上签名安装；Windows 单独运行 `export:ios` 导出的 JavaScript/Hermes 资源包不是 IPA。
- 免费 Apple 账号经 Mac/Xcode 可用于个人真机测试，但需要定期重新签名。不要为了预览购买开发者会员。

## 迁移旧记录

顶部“账号一 / 账号二”用于分别记录家庭成员的预约与购买，不需要登录京东。每个账号的预约设置、历史预约和30/60天次数检查独立；总花费、上门次数、均摊费用、日用品和重复购买提醒按两个账号合计。切换后会记住各自选中的计划。账号二第一次使用时，在“预约计划”中设置日期并生成计划。

商品录入只需填写名称，可添加多件不同商品。首页按商品名称汇总已购种类，重复购买提醒也按名称匹配；旧记录中的分类、数量和单位仍保留在备份里，不再要求填写。

旧版记录和旧 JSON 备份自动归入账号一。新版备份格式为 v3，一份文件包含两个账号；导入会替换两个账号的全部记录，导入前仍保留恢复副本。旧版网页不支持导入新版双账号备份。

旧网页右上角“导出备份”，保存 JSON 到 iPhone“文件”。在这个版本点“导入”选择 JSON，检查确认信息后替换。旧网页、Expo Go 和将来的独立 App 不会自动共享数据。

导入前自动保留当前记录副本，可通过顶部“恢复副本”导出；需要恢复时再导入该文件。只有最近一次替换前的副本会保留。保存失败会显示提示，不会伪称已保存。清除 Expo Go 数据、卸载 Expo Go 或将来的独立 App 前务必导出备份。

沿用原网页的默认首单日期 `2026-09-30`、送达后第9天启用、7天有效期以及2026年假期表。可以在“预约计划”里修改；实际规则以你的券页面为准。没有从手机旧浏览器自动提取任何记录。

## 开发与验证

```powershell
npm.cmd ci
npm.cmd run build:page
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run export:ios
```

- `App.tsx`：安全区、本地 WebView、手机保存、文件导入和系统分享。
- `web/`：原网页计算与记账功能，加上手机保存桥接。
- `src/storage.cjs`：串行保存、读取失败保护、导入恢复副本。
- `scripts/build-web.cjs`：把网页资源内联到 `src/page.generated.json`，页面禁止网络请求。
- `tests/mobile.cjs`：使用 Playwright 与 Edge，断网测试页面和存储协议。需要环境能解析 `playwright` 包；此电脑可使用 Codex 自带的依赖目录作为 `NODE_PATH`。
- `tests/accounts.cjs`：使用相同的浏览器环境，验证旧记录升级、双账号计划与次数隔离、合并统计、切换保存及双账号备份恢复。

自动验证覆盖日期窗口、费用统计、串行保存、损坏数据保护、导入失败保护、离线页面重建、备份取消/确认、特殊文本转义和320–430px手机布局。浏览器测试不能替代 iPhone 上的 WKWebView、文件选择器、系统分享及真正离线冷启动验证。

2026-10-05：类型检查、ESLint、业务/存储测试、离线浏览器测试、iOS资源导出和 Expo Doctor 21/21 检查通过。npm audit 仍报告上游依赖的24项告警（8 moderate、16 high）；没有执行会降级 Expo/React Native 的 `audit fix --force`。完整报告在本地 `test-results/npm-audit.json`。

参考：[Expo 开发环境](https://docs.expo.dev/get-started/set-up-your-environment/)、[苹果免费账号限制](https://developer.apple.com/help/account/basics/about-your-developer-account)。
