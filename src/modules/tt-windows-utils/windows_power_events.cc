#include <napi.h>
#include <windows.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

std::vector<HPOWERNOTIFY> powerNotifications;

std::string GUIDToString(const GUID guid)
{
    wchar_t source[40] = {};
    int length = StringFromGUID2(guid, source, 40);
    if (length == 0) return "";

    int convertedLength = WideCharToMultiByte(
      CP_UTF8, 0, source, length - 1, NULL, 0, NULL, NULL);
    if (convertedLength <= 0) return "";

    std::string result(convertedLength, '\0');
    if (WideCharToMultiByte(CP_UTF8,
                            0,
                            source,
                            length - 1,
                            &result[0],
                            convertedLength,
                            NULL,
                            NULL) == 0) {
        return "";
    }
    return result;
}

bool GetWindowHandle(const Napi::Value& value, HWND* handle)
{
    if (value.IsBigInt()) {
        bool lossless = false;
        uint64_t rawHandle = value.As<Napi::BigInt>().Uint64Value(&lossless);
        if (!lossless) return false;
        *handle = reinterpret_cast<HWND>(static_cast<uintptr_t>(rawHandle));
        return true;
    }

    if (value.IsNumber()) {
        *handle = reinterpret_cast<HWND>(
          static_cast<intptr_t>(value.As<Napi::Number>().Int64Value()));
        return true;
    }

    return false;
}

void ClearPowerSettingNotifications()
{
    for (HPOWERNOTIFY notification : powerNotifications) {
        if (notification != NULL) {
            UnregisterPowerSettingNotification(notification);
        }
    }
    powerNotifications.clear();
}

std::string GetPowerSettingName(const GUID& guid)
{
    if (IsEqualGUID(guid, GUID_CONSOLE_DISPLAY_STATE)) return "GUID_CONSOLE_DISPLAY_STATE";
    if (IsEqualGUID(guid, GUID_MONITOR_POWER_ON)) return "GUID_MONITOR_POWER_ON";
    if (IsEqualGUID(guid, GUID_SESSION_DISPLAY_STATUS)) return "GUID_SESSION_DISPLAY_STATUS";
    if (IsEqualGUID(guid, GUID_SYSTEM_AWAYMODE)) return "GUID_SYSTEM_AWAYMODE";
    if (IsEqualGUID(guid, GUID_LIDSWITCH_STATE_CHANGE)) return "GUID_LIDSWITCH_STATE_CHANGE";
    if (IsEqualGUID(guid, GUID_SESSION_USER_PRESENCE)) return "GUID_SESSION_USER_PRESENCE";
    if (IsEqualGUID(guid, GUID_STANDBY_TIMEOUT)) return "GUID_STANDBY_TIMEOUT";
    if (IsEqualGUID(guid, GUID_VIDEO_ADAPTIVE_DISPLAY_BRIGHTNESS)) return "GUID_VIDEO_ADAPTIVE_DISPLAY_BRIGHTNESS";
    if (IsEqualGUID(guid, GUID_VIDEO_ADAPTIVE_PERCENT_INCREASE)) return "GUID_VIDEO_ADAPTIVE_PERCENT_INCREASE";
    if (IsEqualGUID(guid, GUID_VIDEO_ADAPTIVE_POWERDOWN)) return "GUID_VIDEO_ADAPTIVE_POWERDOWN";
    if (IsEqualGUID(guid, GUID_VIDEO_DIM_TIMEOUT)) return "GUID_VIDEO_DIM_TIMEOUT";
    if (IsEqualGUID(guid, GUID_SLEEP_IDLE_THRESHOLD)) return "GUID_SLEEP_IDLE_THRESHOLD";
    if (IsEqualGUID(guid, GUID_VIDEO_CURRENT_MONITOR_BRIGHTNESS)) return "GUID_VIDEO_CURRENT_MONITOR_BRIGHTNESS";
    if (IsEqualGUID(guid, GUID_VIDEO_POWERDOWN_TIMEOUT)) return "GUID_VIDEO_POWERDOWN_TIMEOUT";
    return "";
}

Napi::Object GetPowerSetting(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        return result;
    }

    bool lossless = false;
    uint64_t rawPointer = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless || rawPointer == 0) {
        return result;
    }

    const POWERBROADCAST_SETTING* setting = reinterpret_cast<const POWERBROADCAST_SETTING*>(
      static_cast<uintptr_t>(rawPointer));
    result.Set("guid", Napi::String::New(env, GUIDToString(setting->PowerSetting)));
    result.Set("name", Napi::String::New(env, GetPowerSettingName(setting->PowerSetting)));

    DWORD data = 0;
    std::memcpy(&data,
                setting->Data,
                std::min<size_t>(setting->DataLength, sizeof(data)));
    result.Set("data", Napi::Number::New(env, data));
    return result;
}

Napi::Boolean RegisterPowerSettingNotifications(const Napi::CallbackInfo& info)
{
    HWND hwnd = NULL;
    if (info.Length() < 1 || !GetWindowHandle(info[0], &hwnd) || hwnd == NULL) {
        return Napi::Boolean::New(info.Env(), false);
    }

    ClearPowerSettingNotifications();
    const GUID* settings[] = {
      &GUID_CONSOLE_DISPLAY_STATE,
      &GUID_MONITOR_POWER_ON,
      &GUID_SESSION_DISPLAY_STATUS,
      &GUID_SYSTEM_AWAYMODE,
      &GUID_LIDSWITCH_STATE_CHANGE,
      &GUID_SESSION_USER_PRESENCE,
      &GUID_STANDBY_TIMEOUT,
      &GUID_VIDEO_ADAPTIVE_DISPLAY_BRIGHTNESS,
      &GUID_VIDEO_ADAPTIVE_PERCENT_INCREASE,
      &GUID_VIDEO_ADAPTIVE_POWERDOWN,
      &GUID_VIDEO_DIM_TIMEOUT,
      &GUID_SLEEP_IDLE_THRESHOLD,
      &GUID_VIDEO_CURRENT_MONITOR_BRIGHTNESS,
      &GUID_VIDEO_POWERDOWN_TIMEOUT,
    };

    for (const GUID* setting : settings) {
        HPOWERNOTIFY notification = RegisterPowerSettingNotification(hwnd, setting, 0);
        if (notification == NULL) {
            ClearPowerSettingNotifications();
            return Napi::Boolean::New(info.Env(), false);
        }
        powerNotifications.push_back(notification);
    }

    return Napi::Boolean::New(info.Env(), true);
}

Napi::Boolean UnregisterPowerSettingNotifications(const Napi::CallbackInfo& info)
{
    ClearPowerSettingNotifications();
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("registerPowerSettingNotifications",
                Napi::Function::New(env, RegisterPowerSettingNotifications));
    exports.Set("unregisterPowerSettingNotifications",
                Napi::Function::New(env, UnregisterPowerSettingNotifications));
    exports.Set("getPowerSetting", Napi::Function::New(env, GetPowerSetting));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
