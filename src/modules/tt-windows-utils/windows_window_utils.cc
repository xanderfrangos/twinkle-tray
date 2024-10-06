#include <napi.h>
#include <windows.h>

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

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "setWindowPos"), Napi::Function::New(env, SetWindowPosition));
    exports.Set(Napi::String::New(env, "getWindowPos"), Napi::Function::New(env, GetWindowPosition));
    exports.Set(Napi::String::New(env, "getClientPos"), Napi::Function::New(env, GetClientPosition));
    exports.Set(Napi::String::New(env, "getForegroundWindow"), Napi::Function::New(env, GetForegroundWin));
    exports.Set(Napi::String::New(env, "setForegroundWindow"), Napi::Function::New(env, SetForegroundWin));
    exports.Set(Napi::String::New(env, "getWindowLong"), Napi::Function::New(env, GetWinLong));
    exports.Set(Napi::String::New(env, "getWindowFullscreen"), Napi::Function::New(env, GetWindowFullscreen));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)