#include <napi.h>
#include <windows.h>
#include <dwmapi.h>

#include <cmath>
#include <cstdint>

#pragma comment(lib, "dwmapi.lib")

constexpr DWORD kUseImmersiveDarkMode = 20;
constexpr DWORD kWindowCornerPreference = 33;
constexpr DWORD kSystemBackdropType = 38;

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
    double rawHandle = value.As<Napi::Number>().DoubleValue();
    if (!std::isfinite(rawHandle) || std::trunc(rawHandle) != rawHandle) return false;
    *handle = reinterpret_cast<HWND>(static_cast<intptr_t>(rawHandle));
    return true;
  }

  return false;
}

Napi::Boolean SetWindowMaterial(const Napi::CallbackInfo& info)
{
  if (info.Length() < 4 || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber()) {
    return Napi::Boolean::New(info.Env(), false);
  }

  HWND hwnd = NULL;
  if (!GetWindowHandle(info[0], &hwnd)) {
    return Napi::Boolean::New(info.Env(), false);
  }

  int backdropType = info[1].As<Napi::Number>().Int32Value();
  int borderType = info[2].As<Napi::Number>().Int32Value();
  int darkMode = info[3].As<Napi::Number>().Int32Value();

  HRESULT darkModeResult = DwmSetWindowAttribute(
    hwnd, kUseImmersiveDarkMode, &darkMode, sizeof(darkMode));
  HRESULT backdropResult = DwmSetWindowAttribute(
    hwnd, kSystemBackdropType, &backdropType, sizeof(backdropType));
  HRESULT cornersResult = DwmSetWindowAttribute(
    hwnd, kWindowCornerPreference, &borderType, sizeof(borderType));

  return Napi::Boolean::New(
    info.Env(), SUCCEEDED(darkModeResult) && SUCCEEDED(backdropResult) && SUCCEEDED(cornersResult));
}

Napi::Boolean SetWindowAttribute(const Napi::CallbackInfo& info)
{
  if (info.Length() < 3 || !info[1].IsNumber() || !info[2].IsNumber()) {
    return Napi::Boolean::New(info.Env(), false);
  }

  HWND hwnd = NULL;
  if (!GetWindowHandle(info[0], &hwnd)) {
    return Napi::Boolean::New(info.Env(), false);
  }

  int value = info[2].As<Napi::Number>().Int32Value();
  HRESULT result = DwmSetWindowAttribute(hwnd,
                                         info[1].As<Napi::Number>().Uint32Value(),
                                         &value,
                                         sizeof(value));
  return Napi::Boolean::New(info.Env(), SUCCEEDED(result));
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
  exports.Set("setWindowMaterial", Napi::Function::New(env, SetWindowMaterial));
  exports.Set("setWindowAttribute", Napi::Function::New(env, SetWindowAttribute));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);
