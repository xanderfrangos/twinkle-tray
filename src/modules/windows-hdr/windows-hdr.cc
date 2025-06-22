// Code based on https://github.com/ledoge/set_maxtml

#include <napi.h>
#include <windows.h>
#include <stdio.h>
#include <math.h>
#include <map>

enum DISPLAYCONFIG_DEVICE_INFO_TYPE_INTERNAL {
    DISPLAYCONFIG_DEVICE_INFO_SET_SDR_WHITE_LEVEL = 0xFFFFFFEE,
};

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

std::string wcharToString(const wchar_t* wstr, boolean hasNullTerminator) {
    try {
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, nullptr, 0, nullptr, nullptr) - (hasNullTerminator ? 1 : 0);
        std::string str(size_needed, 0);
        WideCharToMultiByte(CP_UTF8, 0, wstr, -1, &str[0], size_needed, nullptr, nullptr);
        return str;
    } catch (std::runtime_error& e) {
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
    } catch (std::runtime_error& e) {
        return false;
    }

    return true;
}

std::map<std::string, Display> getDisplays() {
    std::map<std::string, Display> newDisplays;

    DISPLAYCONFIG_PATH_INFO *paths = 0;
    DISPLAYCONFIG_MODE_INFO *modes = 0;
    UINT32 pathCount, modeCount;
    {
      UINT32 flags = QDC_ONLY_ACTIVE_PATHS;
      LONG result = ERROR_SUCCESS;

      do {
        if (paths) {
          free(paths);
        }
        if (modes) {
          free(modes);
        }

        result = GetDisplayConfigBufferSizes(flags, &pathCount, &modeCount);

        if (result != ERROR_SUCCESS) {
          fprintf(stderr, "Error on GetDisplayConfigBufferSizes\n");
          return newDisplays;
        }

        paths = (DISPLAYCONFIG_PATH_INFO *)malloc(pathCount * sizeof(paths[0]));
        modes = (DISPLAYCONFIG_MODE_INFO *)malloc(modeCount * sizeof(modes[0]));

        result =
            QueryDisplayConfig(flags, &pathCount, paths, &modeCount, modes, 0);
        if (result != ERROR_SUCCESS && result != ERROR_INSUFFICIENT_BUFFER) {
          fprintf(stderr, "Error on QueryDisplayConfig\n");
          return newDisplays;
        }
      } while (result == ERROR_INSUFFICIENT_BUFFER);
    }

    for (int i = 0; i < pathCount; i++) {
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
        return newDisplays;
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
        return newDisplays;
      }

      DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO hdrInfo = {};
      hdrInfo.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
      hdrInfo.header.size = sizeof(DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO);
      hdrInfo.header.adapterId = path.targetInfo.adapterId;
      hdrInfo.header.id = path.targetInfo.id;

      result = DisplayConfigGetDeviceInfo(&hdrInfo.header);

      int nits = (int)displayInfo.SDRWhiteLevel * 80 / 1000;
      std::string monitorDevicePath =
          wcharToString(targetName.monitorDevicePath, false);

      Display newDisplay;
      newDisplay.name =
          wcharToString(targetName.monitorFriendlyDeviceName, true);
      newDisplay.path =
          monitorDevicePath.substr(0, monitorDevicePath.find("#{"));
      newDisplay.nits = nits;
      newDisplay.hdrSupported = hdrInfo.advancedColorSupported;
      newDisplay.hdrEnabled = hdrInfo.advancedColorEnabled;
      newDisplay.bits = hdrInfo.bitsPerColorChannel;
      newDisplay.target = path;

      // Only check for HDR if Windows reports it's on
      newDisplay.hdrActive = false;
      if(hdrInfo.advancedColorEnabled) {
        newDisplay.hdrActive = setSDRBrightness(path, nits, true);
      }

      newDisplays.insert({newDisplay.name, newDisplay});
    }

    return newDisplays;
}


Napi::Array nodeGetDisplays(const Napi::CallbackInfo& info) {

    std::map<std::string, Display> displays;

    try {
        displays = getDisplays();
    } catch (std::runtime_error& e) {
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