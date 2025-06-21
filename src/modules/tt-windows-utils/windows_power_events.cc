#include <napi.h>
#include <windows.h>

std::string GUIDToString(const GUID guid) {
    wchar_t source[40];
    int length = StringFromGUID2(guid, source, 40);
    if (length == 0) return "";
    char dest[40];
    wcstombs(dest, source, 40);
    return std::string(dest);
}

Napi::Object GetPowerSetting(const Napi::CallbackInfo& info) {
    std::string name = "";
    Napi::Env env = info.Env();
    Napi::Object obj = Napi::Object::New(env);

    try {
        Napi::BigInt lParamInt = info[0].As<Napi::BigInt>(); 

            bool lossless;
            int64_t lParamValue = lParamInt.Int64Value(&lossless);
            int64_t* lParamPtr = (int64_t*)lParamValue;
            LPARAM lParam = (LPARAM)lParamPtr;    

            POWERBROADCAST_SETTING* setting = reinterpret_cast<POWERBROADCAST_SETTING*>(lParam);
            
            std::string guid = GUIDToString(setting->PowerSetting);
            obj.Set(Napi::String::New(env, "guid"), Napi::String::New(env, guid));

            
            if(IsEqualGUID(setting->PowerSetting, GUID_CONSOLE_DISPLAY_STATE)) {
                name = "GUID_CONSOLE_DISPLAY_STATE";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_MONITOR_POWER_ON)) {
                name = "GUID_MONITOR_POWER_ON";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_SESSION_DISPLAY_STATUS)) {
                name = "GUID_SESSION_DISPLAY_STATUS";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_SYSTEM_AWAYMODE)) {
                name = "GUID_SYSTEM_AWAYMODE";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_LIDSWITCH_STATE_CHANGE)) {
                name = "GUID_LIDSWITCH_STATE_CHANGE";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_SESSION_USER_PRESENCE)) {
                name = "GUID_SESSION_USER_PRESENCE";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_STANDBY_TIMEOUT)) {
                name = "GUID_STANDBY_TIMEOUT";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_VIDEO_ADAPTIVE_DISPLAY_BRIGHTNESS)) {
                name = "GUID_VIDEO_ADAPTIVE_DISPLAY_BRIGHTNESS";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_VIDEO_ADAPTIVE_PERCENT_INCREASE)) {
                name = "GUID_VIDEO_ADAPTIVE_PERCENT_INCREASE";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_VIDEO_ADAPTIVE_POWERDOWN)) {
                name = "GUID_VIDEO_ADAPTIVE_POWERDOWN";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_VIDEO_DIM_TIMEOUT)) {
                name = "GUID_VIDEO_DIM_TIMEOUT";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_SLEEP_IDLE_THRESHOLD)) {
                name = "GUID_SLEEP_IDLE_THRESHOLD";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_VIDEO_CURRENT_MONITOR_BRIGHTNESS)) {
                name = "GUID_VIDEO_CURRENT_MONITOR_BRIGHTNESS";
            } else if(IsEqualGUID(setting->PowerSetting, GUID_VIDEO_POWERDOWN_TIMEOUT)) {
                name = "GUID_VIDEO_POWERDOWN_TIMEOUT";
            }

            obj.Set(Napi::String::New(env, "name"), Napi::String::New(env, name));

            DWORD data = *reinterpret_cast<DWORD*>(setting->Data);
            obj.Set(Napi::String::New(env, "data"), Napi::Number::New(env, data));
    } catch (std::runtime_error& e) {
        
    }
    
    return obj;
}

Napi::Boolean RegisterPowerSettingNotifications(const Napi::CallbackInfo& info) {
    try {
        Napi::Number hwnd = info[0].As<Napi::Number>();
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_CONSOLE_DISPLAY_STATE, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_MONITOR_POWER_ON, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_SESSION_DISPLAY_STATUS, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_SYSTEM_AWAYMODE, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_LIDSWITCH_STATE_CHANGE, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_SESSION_USER_PRESENCE, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_STANDBY_TIMEOUT, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_VIDEO_ADAPTIVE_DISPLAY_BRIGHTNESS, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_VIDEO_ADAPTIVE_PERCENT_INCREASE, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_VIDEO_ADAPTIVE_POWERDOWN, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_VIDEO_DIM_TIMEOUT, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_SLEEP_IDLE_THRESHOLD, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_VIDEO_CURRENT_MONITOR_BRIGHTNESS, 0);
        RegisterPowerSettingNotification(reinterpret_cast<HWND>(hwnd.Int32Value()), &GUID_VIDEO_POWERDOWN_TIMEOUT, 0);
    } catch (std::runtime_error& e) {
        return Napi::Boolean::New(info.Env(), false);
    }

    return Napi::Boolean::New(info.Env(), true);
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "registerPowerSettingNotifications"), Napi::Function::New(env, RegisterPowerSettingNotifications));
    exports.Set(Napi::String::New(env, "getPowerSetting"), Napi::Function::New(env, GetPowerSetting));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)