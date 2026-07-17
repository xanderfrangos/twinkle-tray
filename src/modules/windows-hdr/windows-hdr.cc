// Code based on https://github.com/ledoge/set_maxtml

#include <napi.h>
#include <windows.h>
#include <stdio.h>
#include <math.h>
#include <map>
#include <vector>

enum DISPLAYCONFIG_DEVICE_INFO_TYPE_INTERNAL {
    DISPLAYCONFIG_DEVICE_INFO_SET_SDR_WHITE_LEVEL = 0xFFFFFFEE,
};

// DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2 (Windows 11 24H2+) reports the
// active color mode directly, which distinguishes real HDR from SDR with
// Auto Color Management, where the legacy struct reports
// advancedColorEnabled for both. Defined locally (with distinct names) so
// this builds with older SDKs; on older Windows the call simply fails and
// the legacy path is used.
enum {
    TT_DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO_2 = 15
};

typedef enum _TT_DISPLAYCONFIG_ADVANCED_COLOR_MODE {
    TT_DISPLAYCONFIG_ADVANCED_COLOR_MODE_SDR = 0,
    TT_DISPLAYCONFIG_ADVANCED_COLOR_MODE_WCG = 1,
    TT_DISPLAYCONFIG_ADVANCED_COLOR_MODE_HDR = 2
} TT_DISPLAYCONFIG_ADVANCED_COLOR_MODE;

typedef struct _TT_DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2 {
    DISPLAYCONFIG_DEVICE_INFO_HEADER header;
    union {
        struct {
            UINT32 advancedColorSupported : 1;
            UINT32 advancedColorActive : 1;
            UINT32 reserved1 : 1;
            UINT32 advancedColorLimitedByPolicy : 1;
            UINT32 highDynamicRangeSupported : 1;
            UINT32 highDynamicRangeUserEnabled : 1;
            UINT32 wideColorSupported : 1;
            UINT32 wideColorUserEnabled : 1;
            UINT32 reserved : 24;
        };
        UINT32 value;
    };
    DISPLAYCONFIG_COLOR_ENCODING colorEncoding;
    UINT32 bitsPerColorChannel;
    TT_DISPLAYCONFIG_ADVANCED_COLOR_MODE activeColorMode;
} TT_DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2;

typedef struct _DISPLAYCONFIG_SET_SDR_WHITE_LEVEL {
    DISPLAYCONFIG_DEVICE_INFO_HEADER header;
    unsigned int SDRWhiteLevel;
    unsigned char finalValue;
} _DISPLAYCONFIG_SET_SDR_WHITE_LEVEL;

LONG pathSetSdrWhite(DISPLAYCONFIG_PATH_INFO path, int nits) {
    _DISPLAYCONFIG_SET_SDR_WHITE_LEVEL sdrWhiteParams = {};
    sdrWhiteParams.header.type = (DISPLAYCONFIG_DEVICE_INFO_TYPE) DISPLAYCONFIG_DEVICE_INFO_SET_SDR_WHITE_LEVEL;
    sdrWhiteParams.header.size = sizeof(sdrWhiteParams);
    sdrWhiteParams.header.adapterId = path.targetInfo.adapterId;
    sdrWhiteParams.header.id = path.targetInfo.id;

    sdrWhiteParams.SDRWhiteLevel = nits * 1000 / 80;
    sdrWhiteParams.finalValue = 1;

    return DisplayConfigSetDeviceInfo(&sdrWhiteParams.header);
}

struct Display {
    std::string name;
    std::string path;
    int nits;
    boolean hdrSupported;
    boolean hdrEnabled;
    boolean hdrActive;
    DISPLAYCONFIG_PATH_INFO target;
    int bits;
};

std::string wcharToString(const wchar_t* wstr) {
    try {
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, nullptr, 0, nullptr, nullptr);
        if (size_needed <= 0) {
            return "";
        }
        std::string str(size_needed, 0);
        if (WideCharToMultiByte(CP_UTF8, 0, wstr, -1, &str[0], size_needed, nullptr, nullptr) != size_needed) {
            return "";
        }
        str.pop_back();
        return str;
    } catch (...) {
        return (std::string)("");
    }
}

boolean setSDRBrightness(DISPLAYCONFIG_PATH_INFO target, int desiredNits, bool silent) {
    int nits = desiredNits;

    try {
        if (nits < 80) {
            nits = 80;
        }

        if (nits > 480) {
            nits = 480;
        }

        if (nits % 4 != 0) {
            nits += 4 - (nits % 4);
        }

        LONG result = pathSetSdrWhite(target, nits);

        if (result != ERROR_SUCCESS) {
            if(!silent) fprintf(stderr, "Error on DisplayConfigSetDeviceInfo for SDR white level\n");
            return false;
        }
    } catch (...) {
        return false;
    }

    return true;
}

std::map<std::string, Display> getDisplays() {
    std::map<std::string, Display> newDisplays;

    std::vector<DISPLAYCONFIG_PATH_INFO> paths;
    std::vector<DISPLAYCONFIG_MODE_INFO> modes;
    UINT32 pathCount, modeCount;
    {
      UINT32 flags = QDC_ONLY_ACTIVE_PATHS;
      LONG result = ERROR_SUCCESS;

      do {
        result = GetDisplayConfigBufferSizes(flags, &pathCount, &modeCount);

        if (result != ERROR_SUCCESS) {
          fprintf(stderr, "Error on GetDisplayConfigBufferSizes\n");
          return newDisplays;
        }

        paths.resize(pathCount);
        modes.resize(modeCount);

        result =
            QueryDisplayConfig(flags, &pathCount, paths.data(), &modeCount, modes.data(), 0);
        if (result != ERROR_SUCCESS && result != ERROR_INSUFFICIENT_BUFFER) {
          fprintf(stderr, "Error on QueryDisplayConfig\n");
          return newDisplays;
        }
      } while (result == ERROR_INSUFFICIENT_BUFFER);
    }

    for (UINT32 i = 0; i < pathCount; i++) {
      DISPLAYCONFIG_PATH_INFO path = paths[i];

      DISPLAYCONFIG_TARGET_DEVICE_NAME targetName = {};
      targetName.header.adapterId = path.targetInfo.adapterId;
      targetName.header.id = path.targetInfo.id;
      targetName.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
      targetName.header.size = sizeof(targetName);
      LONG result = DisplayConfigGetDeviceInfo(&targetName.header);

      if (result != ERROR_SUCCESS) {
        fprintf(stderr,
                "Error on DisplayConfigGetDeviceInfo for target name\n");
        continue;
      }

      DISPLAYCONFIG_SDR_WHITE_LEVEL displayInfo = {};
      displayInfo.header.type = (DISPLAYCONFIG_DEVICE_INFO_TYPE)
          DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL;
      displayInfo.header.size = sizeof(displayInfo);
      displayInfo.header.adapterId = path.targetInfo.adapterId;
      displayInfo.header.id = path.targetInfo.id;

      result = DisplayConfigGetDeviceInfo(&displayInfo.header);

      if (result != ERROR_SUCCESS) {
        fprintf(stderr,
                "Error on DisplayConfigGetDeviceInfo for SDR white level\n");
        continue;
      }

      int nits = (int)displayInfo.SDRWhiteLevel * 80 / 1000;
      std::string monitorDevicePath =
          wcharToString(targetName.monitorDevicePath);

      Display newDisplay;
      newDisplay.name =
          wcharToString(targetName.monitorFriendlyDeviceName);
      newDisplay.path =
          monitorDevicePath.substr(0, monitorDevicePath.find("#{"));
      newDisplay.nits = nits;
      newDisplay.target = path;

      // Prefer the newer advanced color info, which reports the active
      // color mode directly.
      TT_DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2 hdrInfo2 = {};
      hdrInfo2.header.type = (DISPLAYCONFIG_DEVICE_INFO_TYPE)
          TT_DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO_2;
      hdrInfo2.header.size = sizeof(hdrInfo2);
      hdrInfo2.header.adapterId = path.targetInfo.adapterId;
      hdrInfo2.header.id = path.targetInfo.id;

      result = DisplayConfigGetDeviceInfo(&hdrInfo2.header);

      if (result == ERROR_SUCCESS) {
        newDisplay.hdrSupported = hdrInfo2.highDynamicRangeSupported;
        newDisplay.hdrEnabled = hdrInfo2.highDynamicRangeUserEnabled;
        newDisplay.bits = hdrInfo2.bitsPerColorChannel;
        newDisplay.hdrActive =
            (hdrInfo2.activeColorMode == TT_DISPLAYCONFIG_ADVANCED_COLOR_MODE_HDR);
      } else {
        // Older Windows: fall back to the legacy advanced color info
        DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO hdrInfo = {};
        hdrInfo.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
        hdrInfo.header.size = sizeof(DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO);
        hdrInfo.header.adapterId = path.targetInfo.adapterId;
        hdrInfo.header.id = path.targetInfo.id;

        result = DisplayConfigGetDeviceInfo(&hdrInfo.header);

        if (result != ERROR_SUCCESS) {
          fprintf(stderr,
                  "Error on DisplayConfigGetDeviceInfo for advanced color\n");
          continue;
        }

        newDisplay.hdrSupported = hdrInfo.advancedColorSupported;
        newDisplay.hdrEnabled = hdrInfo.advancedColorEnabled;
        newDisplay.bits = hdrInfo.bitsPerColorChannel;

        // The legacy struct doesn't report whether HDR is actually active,
        // so probe by attempting to set the current SDR white level.
        // Only check for HDR if Windows reports it's on
        newDisplay.hdrActive = false;
        if(hdrInfo.advancedColorEnabled) {
          newDisplay.hdrActive = setSDRBrightness(path, nits, true);
        }
      }

      newDisplays.insert({newDisplay.path, newDisplay});
    }

    return newDisplays;
}


Napi::Array nodeGetDisplays(const Napi::CallbackInfo& info) {

    std::map<std::string, Display> displays;

    try {
        displays = getDisplays();
    } catch (...) {
        fprintf(stderr, "Error on nodeGetDisplays\n");
    }

    Napi::Env env = info.Env();
    Napi::Array out = Napi::Array::New(env);

    int i = 0;
    for (auto& display : displays) {
        Napi::Object displayObj = Napi::Object::New(env);
        displayObj.Set(Napi::String::New(env, "name"), Napi::String::New(env, display.second.name));
        displayObj.Set(Napi::String::New(env, "path"), Napi::String::New(env, display.second.path));
        displayObj.Set(Napi::String::New(env, "nits"), Napi::Number::New(env, display.second.nits));
        displayObj.Set(Napi::String::New(env, "hdrSupported"), Napi::Boolean::New(env, display.second.hdrSupported));
        displayObj.Set(Napi::String::New(env, "hdrEnabled"), Napi::Boolean::New(env, display.second.hdrEnabled));
        displayObj.Set(Napi::String::New(env, "hdrActive"), Napi::Boolean::New(env, display.second.hdrActive));
        displayObj.Set(Napi::String::New(env, "bits"), Napi::Number::New(env, display.second.bits));
        out.Set(i++, displayObj);
    }

    return out;
}

Napi::Boolean nodeSetSDRBrightness(const Napi::CallbackInfo& info) {
    if(info.Length() != 2) {
        fprintf(stderr, "Invalid number of parameters.\n");
        return Napi::Boolean::New(info.Env(), false);
    }
    Napi::String path = info[0].As<Napi::String>();
    Napi::Number nits = info[1].As<Napi::Number>();

    std::map<std::string, Display> displays = getDisplays();

    boolean result = false;
    for (auto& display : displays) {
        if(display.second.path == (std::string)path) {
            result = setSDRBrightness(display.second.target, nits, false);
            break;
        }
    }

    return Napi::Boolean::New(info.Env(), result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "getDisplays"), Napi::Function::New(env, nodeGetDisplays));
    exports.Set(Napi::String::New(env, "setSDRBrightness"), Napi::Function::New(env, nodeSetSDRBrightness));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
