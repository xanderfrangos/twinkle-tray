# 设计文档：热键「HDR 开/关」动作

日期：2026-08-14
状态：已批准（等待用户复核）

## 背景与上下文

本仓库是 Twinkle Tray v1.18.0-beta2 的 fork。Twinkle Tray 是一个 Electron 桌面应用，通过
系统托盘图标控制显示器亮度/特性，底层用 DDC/CI、WMI 和 Win32 DisplayConfig API。

用户想给现有的**热键动作系统**新增一种动作类型：**切换 Windows 系统的 HDR 开/关**，
可指定目标显示器。这是更大愿景（自定义 VCP 预设按钮、自动化命令按钮）的第一步，
但本设计**只做热键 HDR 动作**。按钮、VCP 预设明确不在本期范围内。

现有热键系统已支持"多步动作序列"。每个动作有类型（`set`、`offset`、`cycle`、`off`、
`refresh`）、目标（`brightness`、`sdr`、`contrast`、`volume`、`powerState` 或任意 VCP 码）、
以及显示器选择（指定某台或全部）。参见 `src/electron.js` 的 `doHotkey` 和
`src/components/SettingsWindow.jsx` 的 `ActionItem`。

## 目标与非目标

### 目标

- 新增热键动作类型 `hdr`，可**明确地开或关** Windows HDR（用户选型 C：不自动判断，
  配置时定死「开」或「关」）。
- 该动作沿用现有的"按动作选显示器"逻辑（指定某台或全部）。
- HDR 开关按显示器独立生效（Windows 把 HDR 视为逐显示器的 "Advanced Color" 设置）。
- 切换后，Twinkle Tray 刷新显示器清单，保证 UI 里的亮度类型和 HDR 状态正确。
- 可通过设置界面现有的热键 UI 配置（动作类型下拉框加「HDR」，选中后出现开/关选择器）。

### 非目标

- 托盘面板里的自定义 VCP 预设按钮（推迟到后续迭代）。
- 托盘面板里的自动化命令按钮（推迟；以后会把"配置好的热键"变成按钮）。
- HDR SDR 亮度调节、HDR 白点亮度控制（已有 `setSDRBrightness`，本期不动）。
- 支持 WMI 的 `WmiMonitorAdvancedColorParams` 类（见下方结论：目标机器/新版本 Windows 上不可用）。
- 任何新增/删除按钮、分组、逐显示器取值映射的 UI。

## 关键结论（来自验证 spike）

验证在目标机器上完成（Windows 11 25H2 build 26200，显示器 SKG2704，单条活跃显示路径）。

1. **WMI 的 `WmiMonitorAdvancedColorParams` 不可用。**
   通过 `Get-CimClass` 确认 `root\wmi` 命名空间里**没有这个类**。用户最初想用的 WMI 方案
   在这台机器上走不通，而且很多新版 Win11 上很可能也没有。**已否决。**

2. **Win32 DisplayConfig API 是干净、可用的机制。**
   社区工具 `GiulioSamp/HDRToggler`（C#/.NET，逐显示器切 HDR）用的正是这套：

   - 枚举活跃路径：`GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS=2)` +
     `QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS)`。
   - 读状态：`DisplayConfigGetDeviceInfo` + `DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO`
     （type **9**）。结构体 `{ HEADER header; uint value; uint colorEncoding;
     uint bitsPerColorChannel; }`。`value` 位0 = 支持高级颜色，位1 = 已开启。
   - 写状态：`DisplayConfigSetDeviceInfo` + `DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE`
     （type **10**）。结构体 `{ HEADER header; uint value; }`，共 24 字节。
     `value` 位0 = 开启高级颜色（HDR 显示器上即切 HDR）。

3. **读、写都已在本机验证可用，且无需管理员权限。**
   完整来回测试（SDR → HDR → SDR）以普通用户（未提权）身份成功执行：
   ```
   切换前:    Supported=True Enabled=False bits=8
   SET开 →   ret=0（成功）
   切换后:    Enabled=True bits=10   ← HDR 真的开了（10bit）
   SET关 →   ret=0（成功）
   切回后:    Enabled=False bits=8
   ```

4. **代码里已有"读"通道。**
   `src/modules/windows-hdr/windows-hdr.cc` 已实现 `getDisplays()`（路径枚举 +
   `DisplayConfigGetDeviceInfo` 读 HDR 状态，用 type 4 和 15）和
   `setSDRBrightness(path, nits)`。只缺一个**写**（Advanced Color 状态）的方法。

## 设计

### 改动点 1：原生模块 `windows-hdr` — 新增 `setAdvancedColor`

文件：`src/modules/windows-hdr/windows-hdr.cc` 和 `index.js`

新增 C++ N-API 方法 `setAdvancedColor(path, enabled)`：

- `path`：与 `getDisplays()` 返回的显示器路径一致的字符串（例如
  `\\?\DISPLAY#SKG2704#5&188254fb&0&UID4355`，即 `monitorDevicePath` 在 `#{` 处截断）。
- 复用 `setSDRBrightness` 已有的按路径查找模式：枚举 `getDisplays()`，找到 `.path`
  匹配的 `Display`，用它的 `.target`。
- 调用 `DisplayConfigSetDeviceInfo`，传入 `DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE`：
  - `header.type` = `DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE`（10）
  - `header.size` = `sizeof(DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE)`（24）
  - `header.adapterId` / `header.id` 来自匹配到的显示器的 target
  - `value` = `enabled ? 1 : 0`（位0 = 开启高级颜色）
- 返回成功/失败（例如 `bool`，或检查 `ERROR_SUCCESS`）。
- 在 `index.js` 里导出为 `setAdvancedColor`。

### 改动点 2：Monitors 线程 — 处理 `hdr` 命令

文件：`src/Monitors.js`

- 新增 `data.type === "hdr"` 的消息处理。
- 消息里直接携带显示路径（见改动点 3）：`data.path`。路径格式与 `getDisplays()`
  输出一致，即 `\\?\DISPLAY#<厂商>#<实例>`，各段等于 `monitor.hwid` 用 `#` 连接后
  加 `\\?\` 前缀（已对照 `getHDRDisplays()` 验证——它把 `display.path` 按 `#` 拆开
  还原出 hwid 各段）。
- 调用 `hdr.setAdvancedColor(data.path, !!data.enabled)`。
- 失败时记录日志（沿用现有日志风格）。

### 改动点 3：热键引擎 — `hdr` 动作分支

文件：`src/electron.js`，`doHotkey`（约第 1707 行）

- 在现有的 `set`/`offset`/`cycle`/`off`/`refresh` 分支旁，新增 `action.type === "hdr"`
  分支。
- 用与其他取值动作相同的逻辑构建"适用显示器"列表（`action.allMonitors` 或
  `action.monitors[monitor.id]`；遵循 `settings.linkedLevelsActive` /
  `settings.hotkeysBreakLinkedLevels`）。
- 对每台适用显示器发送
  `{ type: "hdr", path: <归一化后的显示路径>, enabled: (action.value == 1) }`
  给监视器线程。路径需归一化：win32/HDR 来源的 `monitor.hwid[0]` 已是 `\\?\DISPLAY`，
  若 hwid 连接后已以 `\\?\` 开头则原样使用，否则补上前缀。
- 循环结束后，先清除可能由前面动作（如设亮度）留下的 `pausedMonitorUpdates`，
  再调用 `refreshMonitors(false, true)`（**非完整**刷新，`bypassRateLimit=true`），
  让 UI 的显示器清单、亮度类型和 HDR 状态刷新。非完整刷新同样会跑 `getHDRDisplays`
  更新 `hdr` 字段，但不会触发能力富集，避免滑块长时间变灰。
- HDR 动作不弹亮度浮层（brightness 动作会弹）；靠面板刷新本身反馈。

### 改动点 4：设置界面 — HDR 动作配置

文件：`src/components/SettingsWindow.jsx`，`ActionItem`

- 动作类型 `<select>` 里加 `<option value="hdr">`（文案用本地化 key，如
  `SETTINGS_HOTKEY_ACTION_HDR`，显示「HDR」）。
- `getHotkeyInput()` 里当 `action.type === "hdr"` 时：
  - 不显示 VCP 码输入框（`hotkey-action-code`），不显示目标下拉框。
  - 显示一个绑定到 `action.value` 的开/关选择器（1 = 开，0 = 关），例如「开/关」下拉框。
  - 保留显示器选择列表（HDR 是逐显示器的，必须让用户选具体显示器或全部）。
- `showDisplaysList` 对 `hdr` 必须保持 true（只有 `off`/`refresh` 会隐藏它）。

### 改动点 5：本地化

- 新增动作文案（"HDR"）、「开」「关」选项和「延迟 (毫秒)」的字符串。
- 本 fork 实际维护 `src/localization/en.json`、`zh_Hans.json`、`zh-Hant.json`，都需新增。

### 数据流

先记住这个进程结构（HDR 数据只在第 3、4 步跨进程）：

```
┌──────────────────┐   IPC    ┌──────────────────┐   fork   ┌──────────────────────┐
│ 渲染进程(设置界面)  │ ───────→ │ 主进程(electron.js) │ ───────→ │ Monitors 线程(Monitors.js) │
│ SettingsWindow.jsx │          │   doHotkey()      │          │   hdr 命令处理         │
└──────────────────┘          └─────────┬─────────┘          └──────────┬───────────┘
                                        │                               │ 直接调用 N-API
                                        │                      ┌────────▼──────────┐
                                        │                      │ windows-hdr 原生模块 │
                                        │                      │ setAdvancedColor()  │
                                        │                      └────────┬──────────┘
                                        │                 DisplayConfigSetDeviceInfo
                                        │                               ▼
                                        │                    ┌──────────────────┐
                                        └───────────────────→ │ 操作系统/驱动 → 显示器  │
                                            refreshMonitors   └──────────────────┘
```

**阶段一：配置（做一次）**

1. 设置界面里把动作配成：类型 = HDR，选「开」或「关」（写入 `action.value` = 1 或 0），
   勾选目标显示器（或"全部显示器"）。
2. 保存到 `settings.json`；主进程 `applyHotkeys()` 调用 `globalShortcut.register()`
   把该快捷键注册到系统。

**阶段二：触发（每次按快捷键）**

1. 用户按下快捷键 → 系统回调 `doHotkey(hotkey)`（在主进程）。
2. `doHotkey` 找到该动作选中了哪些显示器（逐个取出 `monitor.hwid`）。
3. 对每台显示器，向 Monitors 线程发一条消息：
   `{ type: "hdr", path: <归一化后的显示路径>, enabled: action.value==1 }`
   （路径归一化：hwid 已以 `\\?\` 开头则原样使用，否则补上。）
4. Monitors 线程收到后直接调用原生模块 `windows-hdr.setAdvancedColor(path, enabled)`，
   并轮询 `getDisplays()` 直到 `hdrActive` 匹配目标值（或 5 秒超时），再回发
   `hdr-applied::<path>` 确认消息。
5. 原生模块在 C++ 里按 `path` 找到显示器，调用
   `DisplayConfigSetDeviceInfo(type=10)` → 操作系统/显卡驱动切换该显示器的 HDR。
6. `doHotkey` 等所有确认到达后，清除 `pausedMonitorUpdates`，调用
   `refreshMonitors(false, true)`（**非完整**刷新，避免触发能力富集导致滑块长时间变灰）。
7. Monitors 线程重新枚举全部显示器状态，把结果回传给主进程，主进程广播给面板 → UI 更新
   （HDR/SDR 标识、亮度类型随之刷新）。

> 关键点：第 3 步发消息是"主进程 → Monitors 线程"，第 5 步是"原生 C++ → 操作系统"，
> 第 7 步是数据回流让界面显示最新状态。HDR 实际切换发生在第 5 步。

## 补充设计：每个热键动作可配置延迟（wait）

**背景**：端到端实测发现两个问题，根因相同——切换 HDR 后显示器需要约 1~2 秒重新协商显示模式，这个窗口期内：
1. 立即执行的 `refreshMonitors` 会读到"过渡中"的显示器状态（类型可能变成 `none`），面板因此不拆分 HDR/SDR 两个滑块；而 `type` 会保持到下一次完整刷新，需再次切换才恢复。
2. 紧随其后的其他动作（VCP/亮度命令）会被正在协商的显示器忽略/拒绝，导致一个热键里的多命令执行不完整。

**方案**：给每个热键动作加一个可配置的 `wait`（毫秒）字段，用户在设置界面每个动作下都能填。

- **数据模型**：`defaultAction` 增加 `wait: 0`。动作对象新增字段 `wait`。
- **执行引擎**（`doHotkey`）：
  - 每个动作执行完后 `await Utils.wait(action.wait || 0)` 再执行下一个动作 → 给显示器留出协商时间，后续命令可成功（解决问题 2）。
  - HDR 动作的 `refreshMonitors(false, true)`（**非完整**刷新）**推迟到所有动作执行完之后**（不再在动作内部立即刷新）→ 显示器稳定后再刷新，面板读到正确类型并正常拆分两个滑块（解决问题 1）；非完整刷新可避免触发能力富集导致的滑块长时间变灰。
- **设置界面**（`ActionItem`）：每个动作下方加「延迟 (ms)」数字输入框，绑定 `action.wait`。
- **本地化**：新增延迟相关字符串（en / zh_Hans / zh-Hant）。

**预期效果**：HDR 动作默认 `wait` 为 0，用户按需设置（如 1000ms）；多命令热键里在 HDR 动作后设置合适延迟即可让整条序列完整执行。

## 错误处理

- 若 `setAdvancedColor` 返回失败（找不到显示器，或 `DisplayConfigSetDeviceInfo` 非 0），
  用 Monitors.js 现有的 `console.log`/日志风格记录错误。v1 不做用户可见的错误弹窗；
  面板刷新后自然能看出来没变化。
- 若目标显示器不支持 HDR，写入会无害地失败（`DisplayConfigSetDeviceInfo` 返回错误），
  记日志并继续。
- 该动作绝不允许抛出异常：按现有 `doHotkey` 循环的 try/catch 风格包裹逐显示器的工作。

## 测试

- **原生模块**：重新编译 `windows-hdr`，然后跑冒烟测试——调 `setAdvancedColor(path, true)`
  再 `false`，确认和 spike 里一样的 SDR→HDR→SDR 转变（`Enabled` 翻转、`bits` 8↔10）。
- **Monitors.js**：用 mock 的 `windows-hdr` 对 `hdr` 命令处理做单元测试。
- **热键动作**：在开发版里配一个动作是「HDR 开」的热键，触发后确认显示器切到 HDR；
  再配一个「HDR 关」，确认切回；确认 `refreshMonitors` 执行、UI 的 HDR/SDR 标识更新。
- **设置界面**：确认下拉框有 HDR 选项、开/关选择器出现、VCP 码输入框隐藏、显示器选择仍可用。
- **回归**：现有热键动作类型（set/offset/cycle/off/refresh）不受影响。

## 风险与注意事项

- `DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE`（type 10）和
  `DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO`（type 9）这两个常量值需要较新的
  Windows SDK。现有 `windows-hdr.cc` 已经用"本地定义新枚举值"的方式处理了 type 4、15，
  照此模式在本地定义 type 常量（用不同命名），让模块在老 SDK 上也能编译。
- 在不支持 HDR 的显示器上，开启 Advanced Color 可能只启用 WCG（广色域）而非 HDR。
  文档里应把这个动作描述为"Advanced Color / HDR"；目标机器（支持 HDR）上的行为已验证。
- 切 HDR 时屏幕会短暂重协商（可能闪一下/黑屏片刻）。这是 Windows 正常行为，和
  在设置里手动开关一样。
- 切换后会触发显示器变更事件；应用现有的显示器变更监听应与我们的显式
  `refreshMonitors` 共存。确认不会重复刷新；如有必要，事件已触发刷新时可不做显式刷新。

---

## 补充设计：把热键变成托盘面板按钮

**背景**：用户原始需求之一是在托盘面板里用按钮触发一系列操作。经讨论简化为——
**把配置好的热键在托盘面板里显示成可点击按钮**，点按钮就等价于按该热键的快捷键，
完整复用现有热键引擎（含动作延迟、HDR 确认、推迟刷新等）。这样任何"组合操作"只需配一个
热键，再选择要不要在面板里显示成按钮，无需为按钮单独做执行逻辑。

**范围**：本次只做"点击按钮 = 触发对应热键"。不做按钮的当前状态高亮、不分组、不按显示器拆分。

### 数据模型

热键对象新增两个字段：
- `name`（string，默认 `""`）：按钮上显示的名字。
- `showInPanel`（boolean，默认 `false`）：是否在托盘面板显示为按钮。

### 设置界面（SettingsWindow.jsx，热键列表）

- 热键创建时默认带 `name: ""`、`showInPanel: false`。
- 热键配置里新增：
  - 「名称」文本输入框，绑定 `hotkey.name`。
  - 「在面板显示为按钮」开关，绑定 `hotkey.showInPanel`。
- 保存走现有的 `updateHotkey` → `sendSettings({ hotkeys })` 通道。

### 托盘面板（BrightnessPanel.jsx）

- 面板顶部（标题栏下方、显示器列表上方）渲染一排按钮。
- 按钮列表 = `window.settings.hotkeys` 中 `showInPanel === true && name` 非空的热键。
- 点击按钮 → `window.triggerHotkey(hotkey.id)`。
- 点完**不关闭面板**，方便连续点多个按钮。
- 面板数据流：热键列表在 settings 里，随 `settings-updated` 事件随 `window.settings`
  一起更新并触发面板重渲染。

### IPC 链路

- `panel-preload.js`：暴露 `window.triggerHotkey(id)` → `ipc.send("trigger-hotkey", id)`。
- `electron.js`：新增 `ipcMain.on("trigger-hotkey", (e, id) => {...})`，在
  `settings.hotkeys` 里按 `id` 找到热键，调用 `doHotkey(hotkey)`。
- `doHotkey` 自带节流（`doingHotkey` 门 + 每热键 100ms 节流），连点不会重复执行。
- 无需新逻辑——按钮只是把"按快捷键"换成"点按钮"。

### 样式与本地化

- 面板 CSS 新增 `.hotkey-buttons` / `.hotkey-button` 样式。
- 本地化新增「名称」「在面板显示为按钮」等字符串（en / zh_Hans / zh-Hant）。

### 不做的事

- 不自动检测按钮所代表动作的当前状态并高亮。
- 不支持分组、排序。
- 不改热键本身的任何行为。
