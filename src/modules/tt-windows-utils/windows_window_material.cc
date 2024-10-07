#include <napi.h>
#include <windows.h>
#include <dwmapi.h>
#pragma comment(lib, "dwmapi.lib")

Napi::Boolean SetWindowMaterial(const Napi::CallbackInfo &info) {
  Napi::Number hwnd = info[0].As<Napi::Number>();
  Napi::Number backdrop = info[1].As<Napi::Number>();
  Napi::Number corners = info[2].As<Napi::Number>();
  Napi::Number mode = info[3].As<Napi::Number>();
  int backdropType = backdrop.Int32Value();
  int darkMode = mode.Int32Value();
  int borderType = corners.Int32Value();
  DwmSetWindowAttribute((HWND) hwnd.Int32Value(), 20, &darkMode, sizeof(darkMode)); // DWMWA_USE_IMMERSIVE_DARK_MODE: 20
  DwmSetWindowAttribute((HWND) hwnd.Int32Value(), 38, &backdropType, sizeof(backdropType)); // DWMWA_SYSTEMBACKDROP_TYPE: 38 
  DwmSetWindowAttribute((HWND) hwnd.Int32Value(), 33, &borderType, sizeof(borderType)); // DWMWA_WINDOW_CORNER_PREFERENCE: 33
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Boolean SetWindowAttribute(const Napi::CallbackInfo &info) {
  Napi::Number hwnd = info[0].As<Napi::Number>();
  Napi::Number type = info[1].As<Napi::Number>();
  Napi::Number value = info[2].As<Napi::Number>();
  int intval = value.Int32Value();
  DwmSetWindowAttribute((HWND) hwnd.Int32Value(), (DWORD) type.Int32Value(), &intval, sizeof(intval));
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "setWindowMaterial"), Napi::Function::New(env, SetWindowMaterial));
  exports.Set(Napi::String::New(env, "setWindowAttribute"), Napi::Function::New(env, SetWindowAttribute));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);