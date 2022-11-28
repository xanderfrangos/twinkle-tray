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

Napi::Number GetForegroundWin(const Napi::CallbackInfo& info) {
    HWND result = GetForegroundWindow();

    return Napi::Number::New(info.Env(), (long) result);
}

Napi::Boolean SetForegroundWin(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();

    boolean result = SetForegroundWindow((HWND) hwnd.Int32Value());

    return Napi::Boolean::New(info.Env(), result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "setWindowPos"), Napi::Function::New(env, SetWindowPosition));
    exports.Set(Napi::String::New(env, "getForegroundWindow"), Napi::Function::New(env, GetForegroundWin));
    exports.Set(Napi::String::New(env, "setForegroundWindow"), Napi::Function::New(env, SetForegroundWin));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)