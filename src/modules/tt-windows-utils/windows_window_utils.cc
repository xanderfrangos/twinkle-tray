#include <napi.h>
#include <windows.h>

#include <cmath>
#include <cstdint>
#include <limits>

bool GetWindowHandle(const Napi::Value& value, HWND* handle)
{
    if (value.IsBigInt()) {
        bool lossless = false;
        uint64_t rawHandle = value.As<Napi::BigInt>().Uint64Value(&lossless);
        if (!lossless) {
            return false;
        }
        *handle = reinterpret_cast<HWND>(static_cast<uintptr_t>(rawHandle));
        return true;
    }

    // Retain support for existing callers that pass special HWND values such
    // as HWND_TOPMOST (-1), while preferring BigInt for real window handles.
    if (value.IsNumber()) {
        double rawHandle = value.As<Napi::Number>().DoubleValue();
        if (!std::isfinite(rawHandle) || std::trunc(rawHandle) != rawHandle
            || rawHandle < static_cast<double>(INT64_MIN)
            || rawHandle > static_cast<double>(INT64_MAX)) {
            return false;
        }
        *handle = reinterpret_cast<HWND>(
          static_cast<intptr_t>(static_cast<int64_t>(rawHandle)));
        return true;
    }

    return false;
}

Napi::Boolean SetWindowPosition(const Napi::CallbackInfo& info)
{
    if (info.Length() < 7) {
        return Napi::Boolean::New(info.Env(), false);
    }

    HWND hwnd = NULL;
    HWND hwndAfter = NULL;
    if (!GetWindowHandle(info[0], &hwnd) || !GetWindowHandle(info[1], &hwndAfter)
        || !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsNumber()
        || !info[5].IsNumber() || !info[6].IsNumber()) {
        return Napi::Boolean::New(info.Env(), false);
    }

    BOOL result = SetWindowPos(hwnd,
                               hwndAfter,
                               info[2].As<Napi::Number>().Int32Value(),
                               info[3].As<Napi::Number>().Int32Value(),
                               info[4].As<Napi::Number>().Int32Value(),
                               info[5].As<Napi::Number>().Int32Value(),
                               info[6].As<Napi::Number>().Uint32Value());
    return Napi::Boolean::New(info.Env(), result != FALSE);
}

Napi::Object RectToObj(Napi::Env env, const RECT& rect)
{
    Napi::Object pos = Napi::Object::New(env);
    pos.Set("top", Napi::Number::New(env, rect.top));
    pos.Set("right", Napi::Number::New(env, rect.right));
    pos.Set("bottom", Napi::Number::New(env, rect.bottom));
    pos.Set("left", Napi::Number::New(env, rect.left));
    pos.Set("width", Napi::Number::New(env, rect.right - rect.left));
    pos.Set("height", Napi::Number::New(env, rect.bottom - rect.top));
    return pos;
}

Napi::Object GetWindowPosition(const Napi::CallbackInfo& info)
{
    HWND hwnd = NULL;
    if (info.Length() < 1 || !GetWindowHandle(info[0], &hwnd)) {
        return Napi::Object::New(info.Env());
    }

    RECT rect = {};
    if (!GetWindowRect(hwnd, &rect)) {
        return Napi::Object::New(info.Env());
    }
    return RectToObj(info.Env(), rect);
}

Napi::Object GetClientPosition(const Napi::CallbackInfo& info)
{
    HWND hwnd = NULL;
    if (info.Length() < 1 || !GetWindowHandle(info[0], &hwnd)) {
        return Napi::Object::New(info.Env());
    }

    RECT rect = {};
    if (!GetClientRect(hwnd, &rect)) {
        return Napi::Object::New(info.Env());
    }
    return RectToObj(info.Env(), rect);
}

Napi::Boolean GetWindowFullscreen(const Napi::CallbackInfo& info)
{
    HWND hwnd = NULL;
    if (info.Length() < 1 || !GetWindowHandle(info[0], &hwnd)) {
        return Napi::Boolean::New(info.Env(), false);
    }

    MONITORINFO monitorInfo = {};
    monitorInfo.cbSize = sizeof(MONITORINFO);
    HMONITOR monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
    if (monitor == NULL || !GetMonitorInfo(monitor, &monitorInfo)) {
        return Napi::Boolean::New(info.Env(), false);
    }

    RECT rect = {};
    if (!GetWindowRect(hwnd, &rect)) {
        return Napi::Boolean::New(info.Env(), false);
    }

    bool fullscreen = rect.left == monitorInfo.rcMonitor.left
        && rect.right == monitorInfo.rcMonitor.right
        && rect.top == monitorInfo.rcMonitor.top
        && rect.bottom == monitorInfo.rcMonitor.bottom;
    return Napi::Boolean::New(info.Env(), fullscreen);
}

Napi::BigInt GetForegroundWin(const Napi::CallbackInfo& info)
{
    HWND result = GetForegroundWindow();
    return Napi::BigInt::New(
      info.Env(), static_cast<uint64_t>(reinterpret_cast<uintptr_t>(result)));
}

Napi::Boolean SetForegroundWin(const Napi::CallbackInfo& info)
{
    HWND hwnd = NULL;
    if (info.Length() < 1 || !GetWindowHandle(info[0], &hwnd)) {
        return Napi::Boolean::New(info.Env(), false);
    }
    return Napi::Boolean::New(info.Env(), SetForegroundWindow(hwnd) != FALSE);
}

Napi::Number GetWinLong(const Napi::CallbackInfo& info)
{
    HWND hwnd = NULL;
    if (info.Length() < 2 || !GetWindowHandle(info[0], &hwnd) || !info[1].IsNumber()) {
        return Napi::Number::New(info.Env(), 0);
    }
    LONG_PTR result = GetWindowLongPtr(hwnd, info[1].As<Napi::Number>().Int32Value());
    return Napi::Number::New(info.Env(), static_cast<double>(result));
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("setWindowPos", Napi::Function::New(env, SetWindowPosition));
    exports.Set("getWindowPos", Napi::Function::New(env, GetWindowPosition));
    exports.Set("getClientPos", Napi::Function::New(env, GetClientPosition));
    exports.Set("getForegroundWindow", Napi::Function::New(env, GetForegroundWin));
    exports.Set("setForegroundWindow", Napi::Function::New(env, SetForegroundWin));
    exports.Set("getWindowLong", Napi::Function::New(env, GetWinLong));
    exports.Set("getWindowFullscreen", Napi::Function::New(env, GetWindowFullscreen));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
