# HDR 热键动作实现计划

> **给代理执行者：** 必选子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐条实现本计划。步骤用复选框（`- [ ]`）标记进度。

**目标：** 给热键系统新增一种动作类型 `hdr`，可对选中的显示器明确地开或关 Windows HDR。

**架构：** 复用现有热键引擎（`src/electron.js` 的 `doHotkey`）、Monitors fork 进程（`src/Monitors.js`）和 `windows-hdr` 原生 N-API 模块。原生模块新增 `setAdvancedColor(path, enabled)` 方法，调用 Win32 `DisplayConfigSetDeviceInfo` API（设备信息类型 10，`DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE`）。主进程向 Monitors 进程发送 `{type:"hdr", path, enabled}`，由它调用原生方法，然后应用刷新显示器清单。设置界面（`ActionItem`）新增「HDR」选项和开/关选择器。

**技术栈：** C++（N-API / node-addon-api）、Electron（主进程 + fork 进程 IPC）、React（设置界面）、JSON 本地化。仓库没有自动化测试框架——验证方式是可运行的冒烟脚本 + 手动 dev 构建检查。

**设计文档：** `docs/superpowers/specs/2026-08-14-hdr-hotkey-action-design.md`

**已验证事实（来自 spike）：** `DisplayConfigSetDeviceInfo` + 类型 10 在目标机器（Win11 25H2，显示器 SKG2704）上可切换 HDR，无需管理员权限；`DisplayConfigGetDeviceInfo` 类型 9 读取状态。`value` 位0 = 开启高级颜色。

---

### 任务 1：原生模块 `windows-hdr` — 新增 `setAdvancedColor`

**文件：**
- 修改：`src/modules/windows-hdr/windows-hdr.cc`
- 修改：`src/modules/windows-hdr/index.js`
- 新建：`src/modules/windows-hdr/example.js`

- [ ] **步骤 1：在 `windows-hdr.cc` 里加类型常量、结构体和设置函数**

在 `src/modules/windows-hdr/windows-hdr.cc` 中现有的 `_DISPLAYCONFIG_SET_SDR_WHITE_LEVEL` 结构体定义之后（第 55 行后）插入：

```cpp
// Windows 11 SDK device-info type that sets a display's Advanced Color
// (HDR) state. Defined locally (distinct name) so this builds with older
// SDKs; on Windows 10/older 11 the call simply fails.
enum {
    TT_DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE = 10
};

typedef struct _TT_DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE {
    DISPLAYCONFIG_DEVICE_INFO_HEADER header;
    union {
        struct {
            UINT32 enableAdvancedColor : 1;
            UINT32 reserved : 31;
        };
        UINT32 value;
    };
} TT_DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE;
```

- [ ] **步骤 2：新增 setAdvancedColor 辅助函数**

在 `windows-hdr.cc` 的 `setSDRBrightness` 函数之后（第 125 行后）插入。签名与 `setSDRBrightness`（带 `bool silent` 参数）保持一致：

```cpp
bool setAdvancedColor(DISPLAYCONFIG_PATH_INFO target, bool enable, bool silent) {
    TT_DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE colorState = {};
    colorState.header.type = (DISPLAYCONFIG_DEVICE_INFO_TYPE) TT_DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE;
    colorState.header.size = sizeof(colorState);
    colorState.header.adapterId = target.targetInfo.adapterId;
    colorState.header.id = target.targetInfo.id;
    colorState.value = enable ? 1 : 0;

    LONG result = DisplayConfigSetDeviceInfo(&colorState.header);
    if (result != ERROR_SUCCESS) {
        if (!silent) fprintf(stderr, "Error on DisplayConfigSetDeviceInfo for advanced color state\n");
        return false;
    }
    return true;
}
```

- [ ] **步骤 3：新增 N-API 包装并注册**

在 `nodeSetSDRBrightness` 之后（`Init` 之前）加包装：

```cpp
Napi::Boolean nodeSetAdvancedColor(const Napi::CallbackInfo& info) {
    if (info.Length() != 2 || !info[0].IsString() || !info[1].IsBoolean()) {
        return Napi::Boolean::New(info.Env(), false);
    }
    Napi::String path = info[0].As<Napi::String>();
    bool enable = info[1].As<Napi::Boolean>().Value();

    std::map<std::string, Display> displays = getDisplays();

    bool result = false;
    for (auto& display : displays) {
        if (display.second.path == (std::string)path) {
            result = setAdvancedColor(display.second.target, enable, false);
            break;
        }
    }

    return Napi::Boolean::New(info.Env(), result);
}
```

在 `Init` 里注册：

```cpp
exports.Set(Napi::String::New(env, "setAdvancedColor"),
            Napi::Function::New(env, nodeSetAdvancedColor));
```

- [ ] **步骤 4：从 `index.js` 导出**

把 `src/modules/windows-hdr/index.js` 的 `module.exports` 改为：

```js
module.exports = {
    getDisplays: addon.getDisplays,
    setSDRBrightness: addon.setSDRBrightness,
    setAdvancedColor: addon.setAdvancedColor
}
```

- [ ] **步骤 5：新建冒烟测试脚本 `src/modules/windows-hdr/example.js`**

```js
const hdr = require("./index");

const displays = hdr.getDisplays();
for (const display of displays) {
    console.log(`${display.name} | path=${display.path} | hdrSupported=${display.hdrSupported} hdrEnabled=${display.hdrEnabled} hdrActive=${display.hdrActive} nits=${display.nits}`)
}

const target = Object.values(displays).find(display => display.hdrSupported)
if (!target) {
    console.log("No HDR-capable display found.")
    process.exit(0)
}

console.log(`\nEnabling HDR on ${target.name} ...`)
console.log("setAdvancedColor(path, true) =", hdr.setAdvancedColor(target.path, true))
setTimeout(() => {
    const after = hdr.getDisplays().find(d => d.path === target.path)
    console.log(`after enable: hdrEnabled=${after.hdrEnabled} hdrActive=${after.hdrActive}`)
    console.log("Disabling HDR ...")
    console.log("setAdvancedColor(path, false) =", hdr.setAdvancedColor(target.path, false))
    setTimeout(() => {
        const final = hdr.getDisplays().find(d => d.path === target.path)
        console.log(`after disable: hdrEnabled=${final.hdrEnabled} hdrActive=${final.hdrActive}`)
        process.exit(0)
    }, 4000)
}, 4000)
```

- [ ] **步骤 6：编译原生模块**

在 `src/modules/windows-hdr` 目录下执行：

```
node-gyp rebuild
```

预期：无编译错误；生成/更新 `build/Release/windows-hdr.node`。（若 `node-gyp` 不在 PATH，改用 `npx node-gyp rebuild`——`node-gyp` 在仓库的 devDependencies 里。）

- [ ] **步骤 7：运行冒烟测试**

在 `src/modules/windows-hdr` 目录下执行：

```
node example.js
```

预期：打印显示器列表，然后完整往返一次，形如：
```
Enabling HDR on <name> ...
setAdvancedColor(path, true) = true
after enable: hdrEnabled=true hdrActive=true
Disabling HDR ...
setAdvancedColor(path, false) = true
after disable: hdrEnabled=false hdrActive=false
```
（每次切换时屏幕会短暂闪黑——正常现象。）

- [ ] **步骤 8：提交**

```bash
git add src/modules/windows-hdr/windows-hdr.cc src/modules/windows-hdr/index.js src/modules/windows-hdr/example.js
git commit -m "feat: add setAdvancedColor (HDR toggle) to windows-hdr module"
```

---

### 任务 2：Monitors 进程 — 处理 `hdr` 命令

**文件：**
- 修改：`src/Monitors.js`

- [ ] **步骤 1：新增 `setAdvancedColor` 辅助函数**

在 `src/Monitors.js` 现有的 `setSDRBrightness` 函数之后（第 1671 行后）插入：

```js
function setAdvancedColor(path, enabled) {
    try {
        const ok = hdr.setAdvancedColor(path, !!enabled)
        if (!ok) console.log(`Couldn't set Advanced Color for ${path}`)
        return ok
    } catch (e) {
        console.log(`Couldn't set Advanced Color! [${path}]`, e)
        return false
    }
}
```

- [ ] **步骤 2：新增消息处理分支**

在 `src/Monitors.js` 的 `handleMonitorMessage` 里，`sdr` 分支（第 211-212 行）之后：

```js
} else if (data.type === "hdr") {
    setAdvancedColor(data.path, data.enabled)
```

- [ ] **步骤 3：验证分支语法正确**

在仓库根目录执行 `node --check src/Monitors.js`。
预期：正常退出（无语法错误）。

- [ ] **步骤 4：提交**

```bash
git add src/Monitors.js
git commit -m "feat: handle hdr command in Monitors process"
```

---

### 任务 3：热键引擎 — 新增 `hdr` 动作分支

**文件：**
- 修改：`src/electron.js`（`doHotkey`，约第 1730 行）

- [ ] **步骤 1：在 `doHotkey` 里新增 `hdr` 分支**

在 `doHotkey` 中，`refresh` 分支（第 1735 行 `await refreshMonitors(true, true)`）之后、`set || offset || cycle` 分支（第 1736 行）之前插入：

```js
} else if (action.type === "hdr") {
    showOverlay = false
    const hotkeyMonitors = []
    for (const monitor of Object.values(monitors)) {
        let applicable = false
        if (action.allMonitors || (settings.linkedLevelsActive && !settings.hotkeysBreakLinkedLevels)) {
            applicable = true
        } else if (Object.keys(action.monitors)?.length && action.monitors[monitor.id]) {
            applicable = true
        }
        if (applicable) hotkeyMonitors.push(monitor)
    }
    if (hotkeyMonitors.length) {
        for (const monitor of hotkeyMonitors) {
            if (!monitor?.hwid?.length) continue
            const hwidString = monitor.hwid.join("#")
            const path = (hwidString.indexOf("\\\\?\\") === 0 ? hwidString : "\\\\?\\" + hwidString)
            monitorsThread.send({
                type: "hdr",
                path,
                enabled: (parseInt(action.value) == 1)
            })
        }
        await refreshMonitors(true, true)
    }
}
```

**注意：** `monitor.hwid` 可能已经以 `\\?\DISPLAY` 开头（win32/HDR 来源的 hwid 由 `devicePath.split("#")` 得到），所以要归一化前缀，避免重复的 `\\?\` 导致原生路径匹配失败。

**注意：** 外层循环已用 try/catch 包裹，与现有动作分支一致。

- [ ] **步骤 2：语法检查**

在仓库根目录执行 `node --check src/electron.js`。
预期：正常退出。

- [ ] **步骤 3：提交**

```bash
git add src/electron.js
git commit -m "feat: support hdr action type in hotkey engine"
```

---

### 任务 4：设置界面 — HDR 动作选项与开/关选择器

**文件：**
- 修改：`src/components/SettingsWindow.jsx`

- [ ] **步骤 1：动作类型下拉框新增「HDR」选项**

在 `ActionItem`（`src/components/SettingsWindow.jsx`，约第 2021 行）的 `cycle` 选项之后加：

```jsx
<option value="hdr">{T.t("SETTINGS_HOTKEY_ACTION_HDR")}</option>
```

- [ ] **步骤 2：在 `getHotkeyInput` 里新增开/关选择器**

在 `getHotkeyInput` 中，`off` 分支（第 1900 行）之后、`else` 块（第 1903 行）之前，新增 `else if`：

```jsx
} else if (action.type === "hdr") {
    return (
        <div className="input-row hotkey-action-hdr">
            <div className="field">
                <label>{T.t("SETTINGS_HOTKEY_HDR_STATE")}</label>
                <select value={(action.value == 1 ? 1 : 0)} onChange={e => {
                    action.value = (e.target.value == "1" ? 1 : 0)
                    props.onChange?.(action)
                }}>
                    <option value="1">{T.t("SETTINGS_HOTKEY_HDR_ON")}</option>
                    <option value="0">{T.t("SETTINGS_HOTKEY_HDR_OFF")}</option>
                </select>
            </div>
        </div>
    )
```

- [ ] **步骤 3：确认 `showDisplaysList` 保留显示器选择列表**

`showDisplaysList` 是 `(action.type != "off" && action.type != "refresh")`（第 1870 行）——对 `hdr` 本来就为 `true`，所以显示器列表保持可见。无需改动。

- [ ] **步骤 4：提交**

```bash
git add src/components/SettingsWindow.jsx
git commit -m "feat: add HDR option to hotkey action editor"
```

---

### 任务 5：本地化字符串

**文件：**
- 修改：`src/localization/en.json`
- 修改：`src/localization/zh_Hans.json`
- 修改：`src/localization/zh-Hant.json`

- [ ] **步骤 1：给 `en.json` 加字符串**

在 `SETTINGS_HOTKEY_ACTION_CYCLE` 行（第 234 行）后加：

```json
    "SETTINGS_HOTKEY_ACTION_HDR": "HDR",
    "SETTINGS_HOTKEY_HDR_STATE": "HDR state",
    "SETTINGS_HOTKEY_HDR_ON": "Enable HDR",
    "SETTINGS_HOTKEY_HDR_OFF": "Disable HDR",
```

- [ ] **步骤 2：给 `zh_Hans.json` 加字符串**

在 `SETTINGS_HOTKEY_ACTION_CYCLE` 行（第 207 行）后加：

```json
    "SETTINGS_HOTKEY_ACTION_HDR": "HDR",
    "SETTINGS_HOTKEY_HDR_STATE": "HDR 状态",
    "SETTINGS_HOTKEY_HDR_ON": "开启",
    "SETTINGS_HOTKEY_HDR_OFF": "关闭",
```

- [ ] **步骤 3：给 `zh-Hant.json` 加字符串**

找到 `SETTINGS_HOTKEY_ACTION_CYCLE` 条目，在其后加：

```json
    "SETTINGS_HOTKEY_ACTION_HDR": "HDR",
    "SETTINGS_HOTKEY_HDR_STATE": "HDR 狀態",
    "SETTINGS_HOTKEY_HDR_ON": "開啟",
    "SETTINGS_HOTKEY_HDR_OFF": "關閉",
```

- [ ] **步骤 4：校验 JSON**

在仓库根目录执行：
```
node -e "['en','zh_Hans','zh-Hant'].forEach(l => { JSON.parse(require('fs').readFileSync('src/localization/'+l+'.json','utf8')); console.log(l+' OK') })"
```
预期：打印 `en OK`、`zh_Hans OK`、`zh-Hant OK`。

- [ ] **步骤 5：提交**

```bash
git add src/localization/en.json src/localization/zh_Hans.json src/localization/zh-Hant.json
git commit -m "feat: localize HDR hotkey action strings"
```

---

### 任务 6：端到端验证（dev 构建）

**文件：** 无（手动验证）

- [ ] **步骤 1：为 Electron 重建原生模块**

在仓库根目录：

```
npx electron-builder install-app-deps
```

（若此步骤慢或失败：任务 1 用 `node-gyp` 编译的 N-API 模块是 ABI 稳定的，通常可直接在 Electron 里加载；装好构建工具后重试。）

- [ ] **步骤 2：启动 dev 构建**

在仓库根目录：

```
npm start
```

预期：出现 Twinkle Tray 托盘图标；必要时打开日志/控制台，确认 `windows-hdr` 无模块加载错误。

- [ ] **步骤 3：配置测试热键**

打开 设置 → 热键 → 添加热键 → 录制快捷键（如 `Ctrl+Alt+H`）。添加动作，类型选 **HDR**，选 **Enable HDR**，目标选「全部显示器」。保存。

- [ ] **步骤 4：触发热键**

按下 `Ctrl+Alt+H`。
预期：显示器切换到 HDR（短暂闪屏）；打开托盘面板可见显示器处于 HDR 状态；设置 → 显示器显示 HDR 指示。

- [ ] **步骤 5：配置并测试关闭路径**

把同一热键动作改成 **Disable HDR**（或新增一个 `Ctrl+Alt+J` 的 HDR 关闭热键）。触发它。
预期：显示器切回 SDR。

- [ ] **步骤 6：回归检查**

触发其他现有动作类型（set/offset/cycle 亮度）的热键，确认行为不变。

- [ ] **步骤 7：最终提交（若验证中发现修复项，用描述性信息提交）**

```bash
git add -A
git commit -m "chore: fixes found during HDR hotkey end-to-end verification"
```
（仅当有修复项时才执行本步骤。）

---

### 任务 7：每个动作可配置延迟（`wait` 毫秒）

给每个热键动作加可配置的 `wait`（毫秒）字段。每个动作执行完后，引擎等待 `wait` 毫秒再执行下一个动作，给显示器留出重新协商的时间（修复：HDR 切换后其他命令失败）。HDR 动作的刷新推迟到等待之后，让显示器清单刷新读到稳定后的显示器（修复：首次切 HDR 不拆分 HDR/SDR 滑块）。

**文件：**
- 修改：`src/components/SettingsWindow.jsx`（defaultAction + ActionItem UI）
- 修改：`src/electron.js`（doHotkey 引擎）
- 修改：`src/localization/en.json`、`src/localization/zh_Hans.json`、`src/localization/zh-Hant.json`

- [ ] **步骤 1：给 `defaultAction` 加 `wait: 0`**

在 `src/components/SettingsWindow.jsx` 的 `defaultAction`（约第 103 行）：

```js
const defaultAction = {
    type: "set",
    target: "brightness",
    monitors: {},
    allMonitors: false,
    value: 0,
    values: [0],
    wait: 0,
    id: uuid()
}
```

- [ ] **步骤 2：给每个动作加「延迟 (ms)」输入框**

在 `ActionItem` 组件返回的 JSX 里（`.action-item-base` div，`getHotkeyInput()` 之后）加延迟输入框：

```jsx
<div className="input-row hotkey-action-wait">
    <div className="field">
        <label>{T.t("SETTINGS_HOTKEY_WAIT")}</label>
        <input type="number" min="0" max="60000" step="100" value={action.wait ?? 0} onChange={e => {
            action.wait = parseInt(e.target.value || 0)
            props.onChange?.(action)
        }} />
    </div>
</div>
```

- [ ] **步骤 3：引擎 — 每个动作后等待，并推迟 HDR 刷新**

在 `src/electron.js` 的 `doHotkey` 里：

(a) 函数体顶部（`setRecentlyInteracted(true)` 之后）加标志：
```js
let refreshAfterActions = false
```

(b) 在 `hdr` 分支里，把末尾的 `await refreshMonitors(true, true)` 换成：
```js
refreshAfterActions = true
```

(c) 在 `for (const action of hotkey.actions)` 循环体的最末尾（该轮 try/catch 的右括号之后）加等待，然后在循环之后加推迟的刷新：

```js
    for (const action of hotkey.actions) {
      try {
        ...
      } catch (e) {
        ...
      }
      await Utils.wait(action.wait || 0)
    }

    if (refreshAfterActions) {
      // Clear any update pause left by prior actions (e.g. brightness sets)
      // so the deferred refresh actually runs.
      if (pausedMonitorUpdates) {
        clearTimeout(pausedMonitorUpdates)
        pausedMonitorUpdates = false
      }
      try {
        await refreshMonitors(false, true)
      } catch (e) {
        console.log("HOTKEY REFRESH ERROR:", e)
      }
    }
```

**重要：** `await Utils.wait(action.wait || 0)` 放在每轮循环迭代的末尾（该动作 try/catch 之后）；推迟的 `refreshAfterActions` 块放在整个 `for` 循环之后（但在 `doingHotkey = false` 之前）。用**非完整**刷新 `refreshMonitors(false, true)`——它仍会通过 `getHDRDisplays` 更新显示器的 `hdr` 字段，但不会触发能力富集（富集会让面板滑块灰几秒）。`hdr` 分支不得再内联调用 `refreshMonitors`——它只设 `refreshAfterActions = true`。

- [ ] **步骤 4：本地化**

给 `src/localization/en.json`（其他 `SETTINGS_HOTKEY_*` 键附近）加：
```json
    "SETTINGS_HOTKEY_WAIT": "Delay (ms)",
```

给 `src/localization/zh_Hans.json` 加：
```json
    "SETTINGS_HOTKEY_WAIT": "延迟 (毫秒)",
```

给 `src/localization/zh-Hant.json` 加：
```json
    "SETTINGS_HOTKEY_WAIT": "延遲 (毫秒)",
```

- [ ] **步骤 5：语法检查**

在仓库根目录执行 `node --check src/electron.js`。预期：正常退出。

校验 JSON：`node -e "['en','zh_Hans','zh-Hant'].forEach(l => { JSON.parse(require('fs').readFileSync('src/localization/'+l+'.json','utf8')); console.log(l+' OK') })"` → 打印三个 OK。

- [ ] **步骤 6：提交**

```bash
git add src/components/SettingsWindow.jsx src/electron.js src/localization/en.json src/localization/zh_Hans.json src/localization/zh-Hant.json
git commit -m "feat: add configurable per-action delay to hotkeys"
```

- [ ] **步骤 7：验证（手动，dev 构建）**

重启 dev 应用。在 设置 → 热键 里：
1. 给现有 HDR 动作设一个延迟（如 1000 ms）。从全新启动触发它——HDR/SDR 滑块应在**首次**切换时就正确拆分（问题 1 已修复）。
2. 建一个双动作热键：[HDR 开 with delay 1000, 亮度设为 80]。触发——两者都应执行（问题 2 已修复）。
3. 回归：无延迟的普通亮度热键仍正常工作。

---

## 自审说明

- **Spec 覆盖：** 原生模块写方法（任务 1）、Monitors `hdr` 命令（任务 2）、热键引擎分支（任务 3）、设置界面选项 + 开/关选择器（任务 4）、本地化（任务 5）、含刷新行为的端到端验证（任务 6）。所有 spec 章节已覆盖。
- **类型一致性：** `setAdvancedColor(path, enabled)`（任务 1 index.js）与任务 2 的 `hdr.setAdvancedColor(data.path, !!data.enabled)`、任务 1 example.js 的 `hdr.setAdvancedColor(path, true/false)` 一致。消息字段 `enabled`（bool）和 `path`（string）在任务 2、3 之间一致。本地化键 `SETTINGS_HOTKEY_ACTION_HDR`、`SETTINGS_HOTKEY_HDR_STATE/ON/OFF` 在任务 4、5 之间一致。
- **仓库无测试框架：** TDD 步骤已调整为可运行的冒烟脚本（`example.js`）和手动 dev 构建验证，因为仓库没有单元测试框架。
