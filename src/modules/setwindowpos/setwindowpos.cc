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

Napi::Boolean SetWindowPosition(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    Napi::Number hwndAfter = info[1].As<Napi::Number>();
    Napi::Number X = info[2].As<Napi::Number>();
    Napi::Number Y = info[3].As<Napi::Number>();
    Napi::Number width = info[4].As<Napi::Number>();
    Napi::Number height = info[5].As<Napi::Number>();
    Napi::Number flags = info[6].As<Napi::Number>();

    boolean result = SetWindowPos((HWND) hwnd.Int32Value(), (HWND) hwndAfter.Int32Value(), X, Y, width, height, flags);

    return Napi::Boolean::New(info.Env(), result);
}

Napi::Object RectToObj(Napi::Env env, RECT rect) {
    Napi::Object pos = Napi::Object::New(env);
    pos.Set(Napi::String::New(env, "top"), Napi::Number::New(env, rect.top));
    pos.Set(Napi::String::New(env, "right"), Napi::Number::New(env, rect.right));
    pos.Set(Napi::String::New(env, "bottom"), Napi::Number::New(env, rect.bottom));
    pos.Set(Napi::String::New(env, "left"), Napi::Number::New(env, rect.left));
    pos.Set(Napi::String::New(env, "width"), Napi::Number::New(env, rect.right - rect.left));
    pos.Set(Napi::String::New(env, "height"), Napi::Number::New(env, rect.bottom - rect.top));
    return pos;
}

Napi::Object GetWindowPosition(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    RECT rect;
    GetWindowRect((HWND) hwnd.Int32Value(), &rect);
    return RectToObj(info.Env(), rect);
}

Napi::Object GetClientPosition(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    RECT rect;
    GetClientRect((HWND) hwnd.Int32Value(), &rect);
    return RectToObj(info.Env(), rect);
}

Napi::Boolean GetWindowFullscreen(const Napi::CallbackInfo& info)
{
    HWND hwnd = (HWND) info[0].As<Napi::Number>().Int32Value();

    MONITORINFO monitorInfo = { 0 };
    monitorInfo.cbSize = sizeof(MONITORINFO);
    GetMonitorInfo(MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY), &monitorInfo);

    RECT rect;
    GetWindowRect(hwnd, &rect);

    bool fullscreen = rect.left == monitorInfo.rcMonitor.left
        && rect.right == monitorInfo.rcMonitor.right
        && rect.top == monitorInfo.rcMonitor.top
        && rect.bottom == monitorInfo.rcMonitor.bottom;

    return Napi::Boolean::New(info.Env(), fullscreen);
}

Napi::Number GetForegroundWin(const Napi::CallbackInfo& info) {
    HWND result = GetForegroundWindow();

    return Napi::Number::New(info.Env(), (long) result);
}

Napi::Boolean SetForegroundWin(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();

    boolean result = SetForegroundWindow((HWND) hwnd.Int32Value());

    return Napi::Boolean::New(info.Env(), result);
}

Napi::Number GetWinLong(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    Napi::Number index = info[1].As<Napi::Number>();

    LONG_PTR result = GetWindowLongPtr((HWND) hwnd.Int32Value(), (int) index.Int32Value());

    return Napi::Number::New(info.Env(), result);
}

Napi::Object GetPowerSetting(const Napi::CallbackInfo& info) {
    Napi::BigInt lParamInt = info[0].As<Napi::BigInt>(); 

    Napi::Env env = info.Env();
    Napi::Object obj = Napi::Object::New(env);

    bool lossless;
    int64_t lParamValue = lParamInt.Int64Value(&lossless);
    int64_t* lParamPtr = (int64_t*)lParamValue;
    LPARAM lParam = (LPARAM)lParamPtr;    

    POWERBROADCAST_SETTING* setting = reinterpret_cast<POWERBROADCAST_SETTING*>(lParam);
    
    std::string guid = GUIDToString(setting->PowerSetting);
    obj.Set(Napi::String::New(env, "guid"), Napi::String::New(env, guid));

    std::string name = "";
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
    
    //obj.Set(Napi::String::New(env, "pointer"), Napi::Number::New(env, lParamValue));
    return obj;
}

Napi::Boolean RegisterPowerSettingNotifications(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_CONSOLE_DISPLAY_STATE, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_MONITOR_POWER_ON, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_SESSION_DISPLAY_STATUS, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_SYSTEM_AWAYMODE, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_LIDSWITCH_STATE_CHANGE, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_SESSION_USER_PRESENCE, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_STANDBY_TIMEOUT, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_VIDEO_ADAPTIVE_DISPLAY_BRIGHTNESS, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_VIDEO_ADAPTIVE_PERCENT_INCREASE, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_VIDEO_ADAPTIVE_POWERDOWN, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_VIDEO_DIM_TIMEOUT, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_SLEEP_IDLE_THRESHOLD, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_VIDEO_CURRENT_MONITOR_BRIGHTNESS, 0);
    RegisterPowerSettingNotification((HWND) hwnd.Int32Value(), &GUID_VIDEO_POWERDOWN_TIMEOUT, 0);
    return Napi::Boolean::New(info.Env(), true);
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "setWindowPos"), Napi::Function::New(env, SetWindowPosition));
    exports.Set(Napi::String::New(env, "getWindowPos"), Napi::Function::New(env, GetWindowPosition));
    exports.Set(Napi::String::New(env, "getClientPos"), Napi::Function::New(env, GetClientPosition));
    exports.Set(Napi::String::New(env, "getForegroundWindow"), Napi::Function::New(env, GetForegroundWin));
    exports.Set(Napi::String::New(env, "setForegroundWindow"), Napi::Function::New(env, SetForegroundWin));
    exports.Set(Napi::String::New(env, "getWindowLong"), Napi::Function::New(env, GetWinLong));
    exports.Set(Napi::String::New(env, "getWindowFullscreen"), Napi::Function::New(env, GetWindowFullscreen));
    exports.Set(Napi::String::New(env, "registerPowerSettingNotifications"), Napi::Function::New(env, RegisterPowerSettingNotifications));
    exports.Set(Napi::String::New(env, "getPowerSetting"), Napi::Function::New(env, GetPowerSetting));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)