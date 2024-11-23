/*
 * win32-displayconfig.cc: part of the "win32-displayconfig" Node package.
 * See the COPYRIGHT file at the top-level directory of this distribution.
 */
#define NAPI_VERSION 4
#include <napi.h>
#include <string.h>
#include <windows.h>

#include <atomic>
#include <memory>
#include <vector>

const int DEVICE_NAME_SIZE = 64;   // 64 comes from DISPLAYCONFIG_TARGET_DEVICE_NAME.monitorFriendlyDeviceName
const int DEVICE_PATH_SIZE = 128;  // 128 comes from DISPLAYCONFIG_TARGET_DEVICE_NAME.monitorDevicePath

struct Win32DeviceNameInfo {
    // Apparently, the adapterId is _not_ persistent between reboots.
    // And yet, the id is. So we likely want to find a better name.
    LUID adapterId;
    UINT32 id;
    DISPLAYCONFIG_TARGET_DEVICE_NAME_FLAGS deviceFlags;
    DISPLAYCONFIG_VIDEO_OUTPUT_TECHNOLOGY outputTechnology;
    UINT16 edidManufactureId;
    UINT16 edidProductCodeId;
    UINT32 connectorInstance;
    WCHAR monitorFriendlyDeviceName[DEVICE_NAME_SIZE];
    WCHAR monitorDevicePath[DEVICE_PATH_SIZE];
};

struct Win32QueryDisplayConfigResults {
    Win32QueryDisplayConfigResults(UINT32 cPathInfo, UINT32 cModeInfo)
        : error(ERROR_SUCCESS) {
        this->rgPathInfo = std::vector<DISPLAYCONFIG_PATH_INFO>(cPathInfo);
        this->rgModeInfo = std::vector<DISPLAYCONFIG_MODE_INFO>(cModeInfo);
        this->rgNameInfo = std::vector<struct Win32DeviceNameInfo>();
    }

    std::vector<DISPLAYCONFIG_PATH_INFO> rgPathInfo;
    std::vector<DISPLAYCONFIG_MODE_INFO> rgModeInfo;
    std::vector<struct Win32DeviceNameInfo> rgNameInfo;
    LONG error;
    BOOL faultWasBuffer;
};

struct Win32TransientDeviceId {
    LUID adapterId;
    UINT32 id;
};

struct Win32DeviceConfigToggleEnabled {
    Win32DeviceConfigToggleEnabled() : enable(), disable() {}

    BOOL persistent;
    std::vector<struct Win32TransientDeviceId> enable;
    std::vector<struct Win32TransientDeviceId> disable;
};

struct Win32RestoreDisplayConfigDevice {
    struct Win32TransientDeviceId sourceId;
    struct Win32TransientDeviceId targetId;
    DISPLAYCONFIG_PATH_INFO pathInfo;
    DISPLAYCONFIG_MODE_INFO sourceModeInfo;
    DISPLAYCONFIG_MODE_INFO targetModeInfo;
};

DWORD RunDisplayChangeContextLoop(LPVOID lpParam);

class Win32DisplayChangeContext {
   public:
    Win32DisplayChangeContext(Napi::Env env, Napi::Function &callback) : running(), dwThreadId(0) {
        this->running.store(TRUE);
        this->hThread = NULL;
        this->tsfn = Napi::ThreadSafeFunction::New(
            env,
            callback,
            "Win32DisplayChangeContext thread",
            512,
            1);
    }

    DWORD Start() {
        this->hThread = CreateThread(NULL, 0, RunDisplayChangeContextLoop, this, 0, &this->dwThreadId);
        if (this->hThread == NULL) {
            this->tsfn.Release();
            return GetLastError();
        } else {
            return ERROR_SUCCESS;
        }
    }

    void Stop() {
        if (this->running.load() == FALSE) {
            return;
        }
        this->running.store(FALSE);
        if (this->hThread != NULL) {
            PostThreadMessage(this->dwThreadId, WM_USER, 0, 0);
            WaitForSingleObject(this->hThread, INFINITE);
            CloseHandle(this->hThread);
            this->tsfn.Release();
        }
    }

    std::atomic<BOOL> running;
    HANDLE hThread;
    Napi::ThreadSafeFunction tsfn;
    DWORD dwThreadId;
};

void HandleDisplayChangeError(Napi::Env env, Napi::Function callback, LPVOID error) {
#pragma warning(push)
#pragma warning(disable : 4311 4302)
    callback.Call(env.Global(), {Napi::Number::New(env, (DWORD)error)});
#pragma warning(pop)
}

void HandleDisplayChangeSuccess(Napi::Env env, Napi::Function callback) {
    callback.Call(env.Global(), {env.Null()});
}

DWORD RunDisplayChangeContextLoop(LPVOID lpParam) {
    auto context = (Win32DisplayChangeContext *)lpParam;
    MSG msg;
    BOOL getMessageResponse;
    DWORD error = ERROR_SUCCESS;
    UINT displayChange = 0;

    // In order to get WM_DISPLAYCHANGE messages we have to create
    // a hidden window in this specific thread.
    HWND hWnd = CreateWindowExW(
        WS_EX_TRANSPARENT,
        L"STATIC",
        L"win32-displayconfig Broadcast Event Monitor",
        WS_OVERLAPPEDWINDOW,
        0, 0, 0, 0,
        NULL,
        NULL,
        GetModuleHandle(NULL),
        NULL);

    // The documentation would lead you to believe you get a WM_DISPLAYCHANGE
    // whenever the display changes. The documentation would be wrong.
    // In fact, you get _this_ thing instead. Which isn't documented anywhere
    // but inferred by StackOverflow on the basis of Spy++ output.
    // YOLO.
    displayChange = RegisterWindowMessageW(L"UxdDisplayChangeMessage");
    if (hWnd == NULL || displayChange == 0) {
        error = GetLastError();
        if (hWnd != NULL) {
            DestroyWindow(hWnd);
        }
#pragma warning(push)
#pragma warning(disable : 4312)
        context->tsfn.NonBlockingCall((LPVOID)error, HandleDisplayChangeError);
#pragma warning(pop)
        return error;
    }

    while (context->running.load() != FALSE && (getMessageResponse = GetMessage(&msg, NULL, 0, 0)) > 0) {
        if (msg.message == displayChange) {
            context->tsfn.NonBlockingCall(HandleDisplayChangeSuccess);
        }

        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    if (getMessageResponse < 0) {
        error = GetLastError();
#pragma warning(push)
#pragma warning(disable : 4312)
        context->tsfn.NonBlockingCall((LPVOID)error, HandleDisplayChangeError);
#pragma warning(pop)
    }

    DestroyWindow(hWnd);
    return error;
}

bool TransientDeviceIdVectorContains(const std::vector<struct Win32TransientDeviceId> &vec, struct Win32TransientDeviceId &dev) {
    for (auto it = vec.begin(); it != vec.end(); it++) {
        if (it->adapterId.LowPart != dev.adapterId.LowPart) {
            continue;
        }
        if (it->adapterId.HighPart != dev.adapterId.HighPart) {
            continue;
        }
        if (it->id != dev.id) {
            continue;
        }
        return true;
    }
    return false;
}

bool AlreadyHasNameInfo(const std::vector<struct Win32DeviceNameInfo> &rgNameInfo, LUID &adapterId, UINT32 id) {
    for (auto it = rgNameInfo.begin(); it != rgNameInfo.end(); it++) {
        if (it->adapterId.LowPart != adapterId.LowPart) {
            continue;
        }
        if (it->adapterId.HighPart != adapterId.HighPart) {
            continue;
        }
        if (it->id != id) {
            continue;
        }
        return true;
    }
    return false;
}

void AcquireDeviceNames(std::shared_ptr<struct Win32QueryDisplayConfigResults> configResults) {
    DISPLAYCONFIG_TARGET_DEVICE_NAME request;
    request.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
    request.header.size = sizeof(request);

    for (auto it = configResults->rgPathInfo.begin(); it != configResults->rgPathInfo.end(); it++) {
        if (AlreadyHasNameInfo(configResults->rgNameInfo, it->targetInfo.adapterId, it->targetInfo.id)) {
            continue;
        }

        request.header.adapterId.LowPart = it->targetInfo.adapterId.LowPart;
        request.header.adapterId.HighPart = it->targetInfo.adapterId.HighPart;
        request.header.id = it->targetInfo.id;
        request.monitorFriendlyDeviceName[0] = '\0';
        request.monitorDevicePath[0] = '\0';

        auto error = DisplayConfigGetDeviceInfo(&request.header);
        if (error != ERROR_SUCCESS) {
            // In the event of failure, drop your breakpoint/logging/evs here.
            // No, we're not going to expose this to Node. It's too much work.
            continue;
        }

        configResults->rgNameInfo.push_back(Win32DeviceNameInfo());
        auto newEntry = configResults->rgNameInfo.end();
        newEntry--;

        newEntry->adapterId.LowPart = it->targetInfo.adapterId.LowPart;
        newEntry->adapterId.HighPart = it->targetInfo.adapterId.HighPart;
        newEntry->id = it->targetInfo.id;
        newEntry->deviceFlags = request.flags;
        newEntry->outputTechnology = request.outputTechnology;
        newEntry->edidManufactureId = request.edidManufactureId;
        newEntry->edidProductCodeId = request.edidProductCodeId;
        newEntry->connectorInstance = request.connectorInstance;
        wcscpy_s(newEntry->monitorFriendlyDeviceName, DEVICE_NAME_SIZE, request.monitorFriendlyDeviceName);
        wcscpy_s(newEntry->monitorDevicePath, DEVICE_PATH_SIZE, request.monitorDevicePath);
    }
}

std::shared_ptr<struct Win32QueryDisplayConfigResults> DoQueryDisplayConfig() {
    UINT32 cPathInfo = 0, cModeInfo = 0, cPathInfoMax = 0, cModeInfoMax = 0;
    while (true) {
        LONG errorCode = GetDisplayConfigBufferSizes(QDC_ALL_PATHS, &cPathInfo, &cModeInfo);
        if (errorCode != ERROR_SUCCESS) {
            cPathInfo = cModeInfo = 0;
        } else {
            if (cPathInfo > cPathInfoMax) {
                cPathInfoMax = cPathInfo;
            }
            cPathInfo = cPathInfoMax;

            if (cModeInfo > cModeInfoMax) {
                cModeInfoMax = cModeInfo;
            }
            cModeInfo = cModeInfoMax;
        }

        auto result = std::make_shared<struct Win32QueryDisplayConfigResults>(cPathInfo, cModeInfo);
        if (errorCode != ERROR_SUCCESS) {
            result->error = errorCode;
            result->faultWasBuffer = true;
            return result;
        }

        errorCode = QueryDisplayConfig(QDC_ALL_PATHS, &cPathInfo, result->rgPathInfo.data(), &cModeInfo, result->rgModeInfo.data(), NULL);
        result->error = errorCode;
        if (errorCode == ERROR_SUCCESS) {
            result->rgPathInfo.resize(cPathInfo);
            result->rgModeInfo.resize(cModeInfo);
            AcquireDeviceNames(result);
            return result;
        } else if (errorCode != ERROR_INSUFFICIENT_BUFFER) {
            result->faultWasBuffer = false;
            return result;
        }
    }
}

LONG ToggleEnabled(const std::shared_ptr<struct Win32DeviceConfigToggleEnabled> args) {
    auto initialQueryResults = DoQueryDisplayConfig();
    if (initialQueryResults->error != ERROR_SUCCESS) {
        return initialQueryResults->error;
    }

    struct Win32TransientDeviceId currentPathDeviceId;
    std::vector<DISPLAYCONFIG_PATH_INFO> preserve;
    std::vector<struct Win32TransientDeviceId> alreadyEnabled;

    // First, ensure that the already enabled devices are accounted for.
    // Windows likes to report all the possible source modes for a given monitor,
    // and we don't want to override them here: we just want to enable the ones
    // that aren't enabled yet.
    for (auto it = initialQueryResults->rgPathInfo.begin(); it != initialQueryResults->rgPathInfo.end(); it++) {
        currentPathDeviceId.adapterId.LowPart = it->targetInfo.adapterId.LowPart;
        currentPathDeviceId.adapterId.HighPart = it->targetInfo.adapterId.HighPart;
        currentPathDeviceId.id = it->targetInfo.id;

        if (it->sourceInfo.modeInfoIdx == DISPLAYCONFIG_PATH_MODE_IDX_INVALID ||
            it->targetInfo.modeInfoIdx == DISPLAYCONFIG_PATH_MODE_IDX_INVALID) {
            continue;
        }

        if ((it->flags & DISPLAYCONFIG_PATH_ACTIVE) == DISPLAYCONFIG_PATH_ACTIVE) {
            auto copied = *it;
            copied.sourceInfo.modeInfoIdx = DISPLAYCONFIG_PATH_MODE_IDX_INVALID;
            copied.sourceInfo.statusFlags = 0;
            copied.targetInfo.modeInfoIdx = DISPLAYCONFIG_PATH_MODE_IDX_INVALID;
            copied.targetInfo.statusFlags = 0;
            preserve.push_back(copied);
            alreadyEnabled.push_back(currentPathDeviceId);
        }
    }

    // Then, enable the devices we wanted to enable but haven't yet
    for (auto it = initialQueryResults->rgPathInfo.begin(); it != initialQueryResults->rgPathInfo.end(); it++) {
        currentPathDeviceId.adapterId.LowPart = it->targetInfo.adapterId.LowPart;
        currentPathDeviceId.adapterId.HighPart = it->targetInfo.adapterId.HighPart;
        currentPathDeviceId.id = it->targetInfo.id;

        if (it->sourceInfo.modeInfoIdx == DISPLAYCONFIG_PATH_MODE_IDX_INVALID) {
            continue;
        }

        if (TransientDeviceIdVectorContains(args->enable, currentPathDeviceId) &&
            !TransientDeviceIdVectorContains(alreadyEnabled, currentPathDeviceId)) {
            auto copied = *it;
            copied.sourceInfo.modeInfoIdx = DISPLAYCONFIG_PATH_MODE_IDX_INVALID;
            copied.sourceInfo.statusFlags = 0;
            copied.targetInfo.modeInfoIdx = DISPLAYCONFIG_PATH_MODE_IDX_INVALID;
            copied.targetInfo.statusFlags = 0;
            copied.targetInfo.scaling = DISPLAYCONFIG_SCALING_PREFERRED;
            copied.flags = DISPLAYCONFIG_PATH_ACTIVE;
            preserve.push_back(copied);
            alreadyEnabled.push_back(currentPathDeviceId);
        }
    }

    // Then, enable all of the devices we know were or need to be enabled.
    // Note that some disabled devices are still in here. Due to Windows being
    // Windows, the only way out of this hole is to turn them all on, then turn off
    // the ones we don't want.
    auto error = SetDisplayConfig(
        preserve.size(),
        preserve.data(),
        0,
        NULL,
        SDC_APPLY | SDC_TOPOLOGY_SUPPLIED | SDC_TOPOLOGY_CLONE | SDC_TOPOLOGY_EXTEND | SDC_ALLOW_PATH_ORDER_CHANGES);

    if (error != ERROR_SUCCESS) {
        return error;
    }

    auto allOnQueryResults = DoQueryDisplayConfig();
    if (allOnQueryResults->error != ERROR_SUCCESS) {
        return allOnQueryResults->error;
    }

    preserve.clear();

    // Finally, disable the monitors that shouldn't be there.
    for (auto it = allOnQueryResults->rgPathInfo.begin(); it != allOnQueryResults->rgPathInfo.end(); it++) {
        currentPathDeviceId.adapterId.LowPart = it->targetInfo.adapterId.LowPart;
        currentPathDeviceId.adapterId.HighPart = it->targetInfo.adapterId.HighPart;
        currentPathDeviceId.id = it->targetInfo.id;

        if (it->sourceInfo.modeInfoIdx == DISPLAYCONFIG_PATH_MODE_IDX_INVALID ||
            it->targetInfo.modeInfoIdx == DISPLAYCONFIG_PATH_MODE_IDX_INVALID) {
            continue;
        }

        if (((it->flags & DISPLAYCONFIG_PATH_ACTIVE) == DISPLAYCONFIG_PATH_ACTIVE) &&
            !TransientDeviceIdVectorContains(args->disable, currentPathDeviceId)) {
            auto copied = *it;
            copied.sourceInfo.modeInfoIdx = DISPLAYCONFIG_PATH_MODE_IDX_INVALID;
            copied.sourceInfo.statusFlags = 0;
            copied.targetInfo.modeInfoIdx = DISPLAYCONFIG_PATH_MODE_IDX_INVALID;
            copied.targetInfo.statusFlags = 0;
            preserve.push_back(copied);
        }
    }

    error = SetDisplayConfig(
        preserve.size(),
        preserve.data(),
        0,
        NULL,
        SDC_APPLY | SDC_TOPOLOGY_SUPPLIED | SDC_ALLOW_PATH_ORDER_CHANGES);

    if (!args->persistent || error != ERROR_SUCCESS) {
        return error;
    }

    // If we say "persistent", then we have to do this whole dance where we figure out
    // what Windows decided to give us and hand it _back_ to Windows to save it.

    auto persistentQueryResults = DoQueryDisplayConfig();
    if (persistentQueryResults->error != ERROR_SUCCESS) {
        return persistentQueryResults->error;
    }

    return SetDisplayConfig(
        persistentQueryResults->rgPathInfo.size(),
        persistentQueryResults->rgPathInfo.data(),
        persistentQueryResults->rgModeInfo.size(),
        persistentQueryResults->rgModeInfo.data(),
        SDC_APPLY | SDC_USE_SUPPLIED_DISPLAY_CONFIG | SDC_SAVE_TO_DATABASE);
}

LONG RestoreDeviceConfig(const std::shared_ptr<std::vector<struct Win32RestoreDisplayConfigDevice>> restoreConfig, BOOL persistent) {
    std::vector<DISPLAYCONFIG_PATH_INFO> rgPathInfo;
    std::vector<DISPLAYCONFIG_MODE_INFO> rgModeInfo;
    DWORD dwModeInfoOffset = 0;

    for (auto it = restoreConfig->begin(); it != restoreConfig->end(); it++) {
        auto pathInfoCopy = it->pathInfo;
        auto sourceModeInfoCopy = it->sourceModeInfo;
        auto targetModeInfoCopy = it->targetModeInfo;

        // Take note: the source "id" fields are not modified.
        // They actually are persistent across reboots, and have special
        // meaning with respect to which extension is "primary" vs secondary.
        // The adapterId still needs to be corrected, as do all IDs on the target.
        // But the source id needs to remain the same.

        pathInfoCopy.sourceInfo.adapterId = it->sourceId.adapterId;
        pathInfoCopy.targetInfo.adapterId = it->targetId.adapterId;
        pathInfoCopy.targetInfo.id = it->targetId.id;

        pathInfoCopy.sourceInfo.modeInfoIdx = dwModeInfoOffset++;
        pathInfoCopy.targetInfo.modeInfoIdx = dwModeInfoOffset++;

        sourceModeInfoCopy.adapterId = it->sourceId.adapterId;
        targetModeInfoCopy.adapterId = it->targetId.adapterId;
        targetModeInfoCopy.id = it->targetId.id;

        rgPathInfo.push_back(pathInfoCopy);
        rgModeInfo.push_back(sourceModeInfoCopy);
        rgModeInfo.push_back(targetModeInfoCopy);
    }

    auto persistFlag = persistent ? SDC_SAVE_TO_DATABASE : 0;

    return SetDisplayConfig(
        rgPathInfo.size(),
        rgPathInfo.data(),
        rgModeInfo.size(),
        rgModeInfo.data(),
        SDC_APPLY | SDC_USE_SUPPLIED_DISPLAY_CONFIG | persistFlag);
}

Napi::Object ConvertLUID(Napi::Env env, const LUID *luid) {
    auto result = Napi::Object::New(env);
    result.Set("LowPart", (double)luid->LowPart);
    result.Set("HighPart", (double)luid->HighPart);
    return result;
}

Napi::Object ConvertSourcePathInfo(Napi::Env env, const DISPLAYCONFIG_PATH_SOURCE_INFO &sourcePathInfo, bool supportsVirtualMode) {
    auto result = Napi::Object::New(env);
    result.Set("adapterId", ConvertLUID(env, &sourcePathInfo.adapterId));
    result.Set("id", (double)sourcePathInfo.id);
    result.Set("statusFlags", (double)sourcePathInfo.statusFlags);

    if (supportsVirtualMode) {
        result.Set("cloneGroupId", (double)sourcePathInfo.cloneGroupId);
        result.Set("modeInfoIdx", (double)sourcePathInfo.sourceModeInfoIdx);
    } else {
        result.Set("modeInfoIdx", (double)sourcePathInfo.modeInfoIdx);
    }
    return result;
}

Napi::String ConvertVideoOutputTechnology(Napi::Env env, DISPLAYCONFIG_VIDEO_OUTPUT_TECHNOLOGY tech) {
    switch (tech) {
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_HD15:
            return Napi::String::New(env, "hd15");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_SVIDEO:
            return Napi::String::New(env, "svideo");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_COMPOSITE_VIDEO:
            return Napi::String::New(env, "composite");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_COMPONENT_VIDEO:
            return Napi::String::New(env, "component");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DVI:
            return Napi::String::New(env, "dvi");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_HDMI:
            return Napi::String::New(env, "hdmi");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_LVDS:
            return Napi::String::New(env, "ldvs");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_D_JPN:
            return Napi::String::New(env, "d_jpn");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_SDI:
            return Napi::String::New(env, "sdi");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EXTERNAL:
            return Napi::String::New(env, "displayport_external");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EMBEDDED:
            return Napi::String::New(env, "displayport_embedded");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_UDI_EXTERNAL:
            return Napi::String::New(env, "udi_external");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_UDI_EMBEDDED:
            return Napi::String::New(env, "udi_embedded");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_SDTVDONGLE:
            return Napi::String::New(env, "sdtvdongle");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_MIRACAST:
            return Napi::String::New(env, "miracast");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INDIRECT_WIRED:
            return Napi::String::New(env, "indirect_wired");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INDIRECT_VIRTUAL:
            return Napi::String::New(env, "indirect_virtual");
        case DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INTERNAL:
            return Napi::String::New(env, "internal");
        default:
            return Napi::String::New(env, "other");
    }
}

Napi::Number ConvertRotation(Napi::Env env, DISPLAYCONFIG_ROTATION rotation) {
    switch (rotation) {
        case DISPLAYCONFIG_ROTATION_ROTATE90:
            return Napi::Number::New(env, 90);
        case DISPLAYCONFIG_ROTATION_ROTATE180:
            return Napi::Number::New(env, 180);
        case DISPLAYCONFIG_ROTATION_ROTATE270:
            return Napi::Number::New(env, 270);
        default:
            return Napi::Number::New(env, 0);
    }
}

Napi::String ConvertScaling(Napi::Env env, DISPLAYCONFIG_SCALING scaling) {
    switch (scaling) {
        case DISPLAYCONFIG_SCALING_CENTERED:
            return Napi::String::New(env, "scaling");
        case DISPLAYCONFIG_SCALING_STRETCHED:
            return Napi::String::New(env, "stretched");
        case DISPLAYCONFIG_SCALING_ASPECTRATIOCENTEREDMAX:
            return Napi::String::New(env, "aspectratiocenteredmax");
        case DISPLAYCONFIG_SCALING_CUSTOM:
            return Napi::String::New(env, "custom");
        case DISPLAYCONFIG_SCALING_PREFERRED:
            return Napi::String::New(env, "preferred");
        default:
            return Napi::String::New(env, "identity");
    }
}

Napi::Object ConvertRational(Napi::Env env, const DISPLAYCONFIG_RATIONAL &rational) {
    auto result = Napi::Object::New(env);
    result.Set("Numerator", (double)rational.Numerator);
    result.Set("Denominator", (double)rational.Denominator);
    return result;
}

Napi::String ConvertScanLineOrdering(Napi::Env env, DISPLAYCONFIG_SCANLINE_ORDERING ordering) {
    switch (ordering) {
        case DISPLAYCONFIG_SCANLINE_ORDERING_PROGRESSIVE:
            return Napi::String::New(env, "progressive");
        case DISPLAYCONFIG_SCANLINE_ORDERING_INTERLACED:
            return Napi::String::New(env, "interlaced");
        case DISPLAYCONFIG_SCANLINE_ORDERING_INTERLACED_LOWERFIELDFIRST:
            return Napi::String::New(env, "interlaced_lowerfieldfirst");
        default:
            return Napi::String::New(env, "unspecified");
    }
}

Napi::Object ConvertTargetPathInfo(Napi::Env env, const DISPLAYCONFIG_PATH_TARGET_INFO &targetPathInfo, bool supportsVirtualMode) {
    auto result = Napi::Object::New(env);
    result.Set("adapterId", ConvertLUID(env, &targetPathInfo.adapterId));
    result.Set("id", (double)targetPathInfo.id);
    result.Set("statusFlags", (double)targetPathInfo.statusFlags);

    result.Set("outputTechnology", ConvertVideoOutputTechnology(env, targetPathInfo.outputTechnology));
    result.Set("rotation", ConvertRotation(env, targetPathInfo.rotation));
    result.Set("scaling", ConvertScaling(env, targetPathInfo.scaling));
    result.Set("refreshRate", ConvertRational(env, targetPathInfo.refreshRate));
    result.Set("scanLineOrdering", ConvertScanLineOrdering(env, targetPathInfo.scanLineOrdering));
    result.Set("targetAvailable", targetPathInfo.targetAvailable);
    result.Set("statusFlags", (double)targetPathInfo.statusFlags);

    if (supportsVirtualMode) {
        result.Set("desktopModeInfoIdx", (double)targetPathInfo.desktopModeInfoIdx);
        result.Set("modeInfoIdx", (double)targetPathInfo.targetModeInfoIdx);
    } else {
        result.Set("modeInfoIdx", (double)targetPathInfo.modeInfoIdx);
    }
    return result;
}

Napi::Object ConvertPathInfo(Napi::Env env, const DISPLAYCONFIG_PATH_INFO &pathInfo) {
    auto result = Napi::Object::New(env);
    result.Set("flags", (double)pathInfo.flags);
    auto supportsVirtualMode = (pathInfo.flags & DISPLAYCONFIG_PATH_SUPPORT_VIRTUAL_MODE) == DISPLAYCONFIG_PATH_SUPPORT_VIRTUAL_MODE;
    result.Set("sourceInfo", ConvertSourcePathInfo(env, pathInfo.sourceInfo, supportsVirtualMode));
    result.Set("targetInfo", ConvertTargetPathInfo(env, pathInfo.targetInfo, supportsVirtualMode));
    return result;
}

Napi::Object ConvertUInt64(Napi::Env env, UINT64 num) {
    auto highPart = num >> 32;
    auto lowPart = num & 0xffffffff;
    auto result = Napi::Object::New(env);
    result.Set("lowPart", (double)lowPart);
    result.Set("highPart", (double)highPart);
    return result;
}

Napi::Object Convert2DRegion(Napi::Env env, const DISPLAYCONFIG_2DREGION &region) {
    auto result = Napi::Object::New(env);
    result.Set("cx", (double)region.cx);
    result.Set("cy", (double)region.cy);
    return result;
}

Napi::Object ConvertVideoSignalInfo(Napi::Env env, const DISPLAYCONFIG_VIDEO_SIGNAL_INFO &videoSignalInfo) {
    auto result = Napi::Object::New(env);
    result.Set("pixelRate", ConvertUInt64(env, videoSignalInfo.pixelRate));
    result.Set("hSyncFreq", ConvertRational(env, videoSignalInfo.hSyncFreq));
    result.Set("vSyncFreq", ConvertRational(env, videoSignalInfo.vSyncFreq));
    result.Set("activeSize", Convert2DRegion(env, videoSignalInfo.activeSize));
    result.Set("totalSize", Convert2DRegion(env, videoSignalInfo.totalSize));
    result.Set("videoStandard", (double)videoSignalInfo.videoStandard);
    result.Set("scanlineOrdering", ConvertScanLineOrdering(env, videoSignalInfo.scanLineOrdering));
    return result;
}

Napi::Object ConvertTargetMode(Napi::Env env, const DISPLAYCONFIG_TARGET_MODE &targetMode) {
    auto result = Napi::Object::New(env);
    result.Set("targetVideoSignalInfo", ConvertVideoSignalInfo(env, targetMode.targetVideoSignalInfo));
    return result;
}

Napi::Value ConvertPixelFormat(Napi::Env env, DISPLAYCONFIG_PIXELFORMAT pixelFormat) {
    switch (pixelFormat) {
        case DISPLAYCONFIG_PIXELFORMAT_8BPP:
            return Napi::Number::New(env, 8);
        case DISPLAYCONFIG_PIXELFORMAT_16BPP:
            return Napi::Number::New(env, 16);
        case DISPLAYCONFIG_PIXELFORMAT_24BPP:
            return Napi::Number::New(env, 24);
        case DISPLAYCONFIG_PIXELFORMAT_32BPP:
            return Napi::Number::New(env, 32);
        default:
            return Napi::String::New(env, "nongdi");
    }
}

Napi::Value ConvertModeInfoType(Napi::Env env, DISPLAYCONFIG_MODE_INFO_TYPE modeInfoType) {
    switch (modeInfoType) {
        case DISPLAYCONFIG_MODE_INFO_TYPE_TARGET:
            return Napi::String::New(env, "target");
        case DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE:
            return Napi::String::New(env, "source");
        case DISPLAYCONFIG_MODE_INFO_TYPE_DESKTOP_IMAGE:
            return Napi::String::New(env, "desktopImage");
        default:
            return env.Undefined();
    }
}

Napi::Object ConvertPointL(Napi::Env env, const POINTL &pointl) {
    auto result = Napi::Object::New(env);
    result.Set("x", (double)pointl.x);
    result.Set("y", (double)pointl.y);
    return result;
}

Napi::Object ConvertSourceMode(Napi::Env env, const DISPLAYCONFIG_SOURCE_MODE &sourceMode) {
    auto result = Napi::Object::New(env);
    result.Set("width", (double)sourceMode.width);
    result.Set("height", (double)sourceMode.height);
    result.Set("pixelFormat", ConvertPixelFormat(env, sourceMode.pixelFormat));
    result.Set("position", ConvertPointL(env, sourceMode.position));
    return result;
}

Napi::Object ConvertRectL(Napi::Env env, const RECTL &rectl) {
    auto result = Napi::Object::New(env);
    result.Set("left", (double)rectl.left);
    result.Set("top", (double)rectl.top);
    result.Set("right", (double)rectl.right);
    result.Set("bottom", (double)rectl.bottom);
    return result;
}

Napi::Object ConvertDesktopImageInfo(Napi::Env env, const DISPLAYCONFIG_DESKTOP_IMAGE_INFO &imageInfo) {
    auto result = Napi::Object::New(env);
    result.Set("PathSourceSize", ConvertPointL(env, imageInfo.PathSourceSize));
    result.Set("DesktopImageRegion", ConvertRectL(env, imageInfo.DesktopImageRegion));
    result.Set("DesktopImageClip", ConvertRectL(env, imageInfo.DesktopImageClip));
    return result;
}

Napi::Object ConvertModeInfo(Napi::Env env, const DISPLAYCONFIG_MODE_INFO &modeInfo) {
    auto result = Napi::Object::New(env);
    result.Set("infoType", ConvertModeInfoType(env, modeInfo.infoType));
    result.Set("id", (double)modeInfo.id);
    result.Set("adapterId", ConvertLUID(env, &modeInfo.adapterId));

    switch (modeInfo.infoType) {
        case DISPLAYCONFIG_MODE_INFO_TYPE_TARGET:
            result.Set("targetMode", ConvertTargetMode(env, modeInfo.targetMode));
            break;
        case DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE:
            result.Set("sourceMode", ConvertSourceMode(env, modeInfo.sourceMode));
            break;
        case DISPLAYCONFIG_MODE_INFO_TYPE_DESKTOP_IMAGE:
            result.Set("desktopImageInfo", ConvertDesktopImageInfo(env, modeInfo.desktopImageInfo));
            break;
    }

    return result;
}

Napi::Object ConvertNameInfo(Napi::Env env, const struct Win32DeviceNameInfo &nameInfo) {
    auto result = Napi::Object::New(env);
    result.Set("adapterId", ConvertLUID(env, &nameInfo.adapterId));
    result.Set("id", (double)nameInfo.id);
    result.Set("deviceFlags", (double)nameInfo.deviceFlags.value);
    result.Set("outputTechnology", ConvertVideoOutputTechnology(env, nameInfo.outputTechnology));
    result.Set("edidManufactureId", (double)nameInfo.edidManufactureId);
    result.Set("edidProductCodeId", (double)nameInfo.edidProductCodeId);
    result.Set("connectorInstance", (double)nameInfo.connectorInstance);
    result.Set("monitorFriendlyDeviceName", Napi::String::New(env, (const char16_t *)nameInfo.monitorFriendlyDeviceName, wcsnlen_s(nameInfo.monitorFriendlyDeviceName, DEVICE_NAME_SIZE)));
    result.Set("monitorDevicePath", Napi::String::New(env, (const char16_t *)nameInfo.monitorDevicePath, wcsnlen_s(nameInfo.monitorDevicePath, DEVICE_PATH_SIZE)));
    return result;
}

Napi::Array ConvertPathsInfo(Napi::Env env, const std::vector<DISPLAYCONFIG_PATH_INFO> &rgPathInfo) {
    auto result = Napi::Array::New(env, rgPathInfo.size());
    auto data = rgPathInfo.data();
    for (int i = 0; i < rgPathInfo.size(); i++) {
        auto item = Napi::Object::New(env);
        auto buffer = Napi::Buffer<DISPLAYCONFIG_PATH_INFO>::Copy(env, data + i, 1);

        item.Set("value", ConvertPathInfo(env, rgPathInfo[i]));
        item.Set("buffer", buffer);
        result.Set(i, item);
    }
    return result;
}

Napi::Array ConvertModesInfo(Napi::Env env, const std::vector<DISPLAYCONFIG_MODE_INFO> &rgModeInfo) {
    auto result = Napi::Array::New(env, rgModeInfo.size());
    auto data = rgModeInfo.data();
    for (int i = 0; i < rgModeInfo.size(); i++) {
        auto item = Napi::Object::New(env);
        auto buffer = Napi::Buffer<DISPLAYCONFIG_MODE_INFO>::Copy(env, data + i, 1);

        item.Set("value", ConvertModeInfo(env, rgModeInfo[i]));
        item.Set("buffer", buffer);
        result.Set(i, item);
    }
    return result;
}

Napi::Array ConvertNamesInfo(Napi::Env env, const std::vector<struct Win32DeviceNameInfo> &rgNameInfo) {
    auto result = Napi::Array::New(env, rgNameInfo.size());
    for (int i = 0; i < rgNameInfo.size(); i++) {
        result.Set(i, ConvertNameInfo(env, rgNameInfo[i]));
    }
    return result;
}

Napi::Object ConvertConfigResults(Napi::Env env, const std::shared_ptr<struct Win32QueryDisplayConfigResults> configResults) {
    auto result = Napi::Object::New(env);
    result.Set("pathArray", ConvertPathsInfo(env, configResults->rgPathInfo));
    result.Set("modeArray", ConvertModesInfo(env, configResults->rgModeInfo));
    result.Set("nameArray", ConvertNamesInfo(env, configResults->rgNameInfo));
    return result;
}

class Win32QueryDisplayConfigWorker : public Napi::AsyncWorker {
   public:
    Win32QueryDisplayConfigWorker(Napi::Function &callback) : Napi::AsyncWorker(callback), configResults() {}

    void Execute() {
        this->configResults = DoQueryDisplayConfig();
    }

    std::vector<napi_value> GetResult(Napi::Env env) {
        std::vector<napi_value> result{env.Null(), env.Undefined()};
        if (this->configResults->error != ERROR_SUCCESS) {
            result[0] = Napi::Number::New(env, (double)this->configResults->error);
        } else {
            result[1] = ConvertConfigResults(env, this->configResults);
        }

        return result;
    }

   private:
    std::shared_ptr<struct Win32QueryDisplayConfigResults> configResults;
};

Napi::Value Win32QueryDisplayConfig(const Napi::CallbackInfo &info) {
    if (info.Length() < 1) {
        return Napi::Boolean::New(info.Env(), false);
    }
    if (!(info[0].IsFunction())) {
        return Napi::Boolean::New(info.Env(), false);
    }

    auto callback = info[0].As<Napi::Function>();
    auto worker = new Win32QueryDisplayConfigWorker(callback);
    worker->Queue();
    return Napi::Boolean::New(info.Env(), true);
}

class Win32ToggleEnabledWorker : public Napi::AsyncWorker {
   public:
    Win32ToggleEnabledWorker(Napi::Function &callback, std::shared_ptr<struct Win32DeviceConfigToggleEnabled> args)
        : Napi::AsyncWorker(callback), args(args) {}

    void Execute() {
        this->errorCode = ToggleEnabled(this->args);
    }

    std::vector<napi_value> GetResult(Napi::Env env) {
        std::vector<napi_value> result{env.Null(), Napi::Number::New(env, (double)this->errorCode)};
        return result;
    }

   private:
    std::shared_ptr<struct Win32DeviceConfigToggleEnabled> args;
    LONG errorCode;
};

bool ExtractTransientDeviceId(Napi::Value val, Win32TransientDeviceId *const receiver) {
    if (!val.IsObject()) {
        return false;
    }
    auto obj = val.As<Napi::Object>();
    auto adapterIdVal = obj.Get("adapterId");
    if (!adapterIdVal.IsObject()) {
        return false;
    }
    auto adapterIdObj = adapterIdVal.As<Napi::Object>();
    auto adapterIdLowPartVal = adapterIdObj.Get("LowPart");
    auto adapterIdHighPartVal = adapterIdObj.Get("HighPart");
    if (!adapterIdLowPartVal.IsNumber() || !adapterIdHighPartVal.IsNumber()) {
        return false;
    }
    auto idVal = obj.Get("id");
    if (!idVal.IsNumber()) {
        return false;
    }
    receiver->adapterId.LowPart = (uint32_t)adapterIdLowPartVal.As<Napi::Number>();
    receiver->adapterId.HighPart = (int32_t)adapterIdHighPartVal.As<Napi::Number>();
    receiver->id = (uint32_t)idVal.As<Napi::Number>();
    return true;
}

std::shared_ptr<struct Win32DeviceConfigToggleEnabled> ExtractToggleEnabledDisplayArguments(Napi::Object obj) {
    auto ret = std::make_shared<struct Win32DeviceConfigToggleEnabled>();
    struct Win32TransientDeviceId cur;
    ret->persistent = (bool)obj.Get("persistent").ToBoolean();
    auto enableVal = obj.Get("enable");
    auto disableVal = obj.Get("disable");

    if (enableVal.IsArray()) {
        auto enableArr = enableVal.As<Napi::Array>();
        for (DWORD i = 0; i < enableArr.Length(); i++) {
            if (ExtractTransientDeviceId(enableArr.Get(i), &cur)) {
                ret->enable.push_back(cur);
            }
        }
    }

    if (disableVal.IsArray()) {
        auto disableArr = disableVal.As<Napi::Array>();
        for (DWORD i = 0; i < disableArr.Length(); i++) {
            if (ExtractTransientDeviceId(disableArr.Get(i), &cur)) {
                ret->disable.push_back(cur);
            }
        }
    }

    return ret;
}

Napi::Value Win32ToggleEnabledDisplays(const Napi::CallbackInfo &info) {
    if (info.Length() < 2) {
        return Napi::Boolean::New(info.Env(), false);
    }
    if (!info[0].IsObject()) {
        return Napi::Boolean::New(info.Env(), false);
    }
    if (!info[1].IsFunction()) {
        return Napi::Boolean::New(info.Env(), false);
    }

    auto args = ExtractToggleEnabledDisplayArguments(info[0].As<Napi::Object>());
    auto worker = new Win32ToggleEnabledWorker(info[1].As<Napi::Function>(), args);
    worker->Queue();
    return Napi::Boolean::New(info.Env(), true);
}

class Win32RestoreDisplayConfigWorker : public Napi::AsyncWorker {
   public:
    Win32RestoreDisplayConfigWorker(Napi::Function &callback, std::shared_ptr<std::vector<struct Win32RestoreDisplayConfigDevice>> configs, BOOL persistent)
        : Napi::AsyncWorker(callback), configs(configs), persistent(persistent) {}

    void Execute() {
        this->errorCode = RestoreDeviceConfig(this->configs, this->persistent);
    }

    std::vector<napi_value> GetResult(Napi::Env env) {
        std::vector<napi_value> result{env.Null(), Napi::Number::New(env, (double)this->errorCode)};
        return result;
    }

   private:
    std::shared_ptr<std::vector<struct Win32RestoreDisplayConfigDevice>> configs;
    LONG errorCode;
    BOOL persistent;
};

BOOL ExtractRestoreDisplayConfigEntry(Napi::Env env, Napi::Object obj, struct Win32RestoreDisplayConfigDevice *receiver) {
    auto sourceConfigIdVal = obj.Get("sourceConfigId");
    auto targetConfigIdVal = obj.Get("targetConfigId");
    auto pathBufferVal = obj.Get("pathBuffer");
    auto sourceModeBufferVal = obj.Get("sourceModeBuffer");
    auto targetModeBufferVal = obj.Get("targetModeBuffer");

    if (!sourceConfigIdVal.IsObject() ||
        !targetConfigIdVal.IsObject() ||
        !pathBufferVal.IsBuffer() ||
        !sourceModeBufferVal.IsBuffer() ||
        !targetModeBufferVal.IsBuffer()) {
        return false;
    }

    if (!ExtractTransientDeviceId(sourceConfigIdVal.As<Napi::Object>(), &receiver->sourceId)) {
        return false;
    }
    if (!ExtractTransientDeviceId(targetConfigIdVal.As<Napi::Object>(), &receiver->targetId)) {
        return false;
    }

    auto pathBuffer = pathBufferVal.As<Napi::Buffer<uint8_t>>();
    auto sourceModeBuffer = sourceModeBufferVal.As<Napi::Buffer<uint8_t>>();
    auto targetModeBuffer = targetModeBufferVal.As<Napi::Buffer<uint8_t>>();

    if (pathBuffer.Length() != sizeof(DISPLAYCONFIG_PATH_INFO) || sourceModeBuffer.Length() != sizeof(DISPLAYCONFIG_MODE_INFO) || targetModeBuffer.Length() != sizeof(DISPLAYCONFIG_MODE_INFO)) {
        return false;
    }

    memcpy_s(&receiver->pathInfo, sizeof(receiver->pathInfo), pathBuffer.Data(), pathBuffer.Length());
    memcpy_s(&receiver->sourceModeInfo, sizeof(receiver->sourceModeInfo), sourceModeBuffer.Data(), sourceModeBuffer.Length());
    memcpy_s(&receiver->targetModeInfo, sizeof(receiver->targetModeInfo), targetModeBuffer.Data(), targetModeBuffer.Length());
    return true;
}

Napi::Value Win32RestoreDisplayConfig(const Napi::CallbackInfo &info) {
    if (info.Length() < 2) {
        return Napi::Boolean::New(info.Env(), false);
    }
    if (!info[0].IsArray() || !info[1].IsFunction()) {
        return Napi::Boolean::New(info.Env(), false);
    }
    BOOL persistent = false;
    if (info.Length() >= 3) {
        persistent = info[2].ToBoolean();
    }

    struct Win32RestoreDisplayConfigDevice curConfig;
    auto configs = std::make_shared<std::vector<struct Win32RestoreDisplayConfigDevice>>();
    auto providedArray = info[0].As<Napi::Array>();

    for (DWORD i = 0; i < providedArray.Length(); i++) {
        auto providedCur = providedArray.Get(i);
        if (!providedCur.IsObject()) {
            continue;
        }

        if (ExtractRestoreDisplayConfigEntry(info.Env(), providedCur.As<Napi::Object>(), &curConfig)) {
            configs->push_back(curConfig);
        }
    }

    auto worker = new Win32RestoreDisplayConfigWorker(info[1].As<Napi::Function>(), configs, persistent);
    worker->Queue();
    return Napi::Boolean::New(info.Env(), true);
}

static Win32DisplayChangeContext *displayEventContext = NULL;

Napi::Value Win32ListenForDisplayChanges(const Napi::CallbackInfo &info) {
    if (info.Length() < 1 || !info[0].IsFunction()) {
        return Napi::Boolean::New(info.Env(), false);
    }
    if (displayEventContext != NULL) {
        return Napi::Boolean::New(info.Env(), true);
    }

    displayEventContext = new Win32DisplayChangeContext(info.Env(), info[0].As<Napi::Function>());
    auto error = displayEventContext->Start();
    if (error != ERROR_SUCCESS) {
        delete displayEventContext;
        displayEventContext = NULL;
    }
    return Napi::Number::New(info.Env(), error);
}

Napi::Value Win32StopListeningForDisplayChanges(const Napi::CallbackInfo &info) {
    if (displayEventContext == NULL) {
        return info.Env().Undefined();
    }

    displayEventContext->Stop();
    // ->Stop() waits (blocking) for the outstanding thread, so we'll be the only
    // thread referencing displayEventContext once it's gone.
    delete displayEventContext;
    displayEventContext = NULL;

    return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("win32_queryDisplayConfig", Napi::Function::New(env, Win32QueryDisplayConfig));
    exports.Set("win32_toggleEnabledDisplays", Napi::Function::New(env, Win32ToggleEnabledDisplays));
    exports.Set("win32_restoreDisplayConfig", Napi::Function::New(env, Win32RestoreDisplayConfig));

    // Take note: while none of these functions are meant to be called directly in JavaScript,
    // these two in particular _depend_ on ordering enforced by JavaScript to function correctly.
    // You can only have one active event listener passed to this C++ library; otherwise we ignore
    // further event listeners.
    //
    // See index.js for the "right" way to do this: we pass one function to this module that
    // dispatches other JavaScript functions for us.
    exports.Set("win32_listenForDisplayChanges", Napi::Function::New(env, Win32ListenForDisplayChanges));
    exports.Set("win32_stopListeningForDisplayChanges", Napi::Function::New(env, Win32StopListeningForDisplayChanges));

    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)