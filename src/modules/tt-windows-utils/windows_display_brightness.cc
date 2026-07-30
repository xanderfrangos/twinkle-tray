#include <napi.h>
#include <windows.h>

#include <cmath>
#include <cstdint>
#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace {

struct GammaState {
    std::vector<WORD> baseRamp;
    int brightness = 100;
};

std::map<std::wstring, GammaState> gammaStates;
std::mutex gammaMutex;

std::wstring utf8ToWide(const std::string& value)
{
    if (value.empty()) return {};
    const int length = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    if (length <= 1) return {};
    std::wstring output(length, L'\0');
    if (MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, output.data(), length) <= 0) return {};
    output.pop_back();
    return output;
}

std::wstring normalizeDisplayName(const std::wstring& value)
{
    const size_t suffix = value.find(L"\\Monitor");
    return suffix == std::wstring::npos ? value : value.substr(0, suffix);
}

HDC openDisplay(const std::wstring& displayName)
{
    const std::wstring normalized = normalizeDisplayName(displayName);
    return normalized.empty() ? nullptr : CreateDCW(L"DISPLAY", normalized.c_str(), nullptr, nullptr);
}

bool readRamp(HDC dc, std::vector<WORD>& ramp)
{
    ramp.resize(3 * 256);
    return GetDeviceGammaRamp(dc, ramp.data()) != FALSE;
}

bool ensureState(const std::wstring& displayName, HDC dc, GammaState*& state)
{
    const std::wstring normalized = normalizeDisplayName(displayName);
    auto found = gammaStates.find(normalized);
    if (found != gammaStates.end()) {
        state = &found->second;
        return true;
    }
    GammaState initial;
    if (!readRamp(dc, initial.baseRamp)) return false;
    auto inserted = gammaStates.emplace(normalized, std::move(initial));
    state = &inserted.first->second;
    return true;
}

Napi::Number getBrightness(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) return Napi::Number::New(env, -1);
    const std::wstring displayName = utf8ToWide(info[0].As<Napi::String>().Utf8Value());
    if (displayName.empty()) return Napi::Number::New(env, -1);

    std::lock_guard<std::mutex> lock(gammaMutex);
    HDC dc = openDisplay(displayName);
    if (!dc) return Napi::Number::New(env, -1);
    GammaState* state = nullptr;
    const bool initialized = ensureState(displayName, dc, state);
    DeleteDC(dc);
    return Napi::Number::New(env, initialized ? state->brightness : -1);
}

Napi::Boolean setBrightness(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) return Napi::Boolean::New(env, false);
    const double requested = info[1].As<Napi::Number>().DoubleValue();
    if (!std::isfinite(requested) || requested < 0 || requested > 100 || std::floor(requested) != requested) {
        return Napi::Boolean::New(env, false);
    }
    const std::wstring displayName = utf8ToWide(info[0].As<Napi::String>().Utf8Value());
    if (displayName.empty()) return Napi::Boolean::New(env, false);

    std::lock_guard<std::mutex> lock(gammaMutex);
    HDC dc = openDisplay(displayName);
    if (!dc) return Napi::Boolean::New(env, false);
    GammaState* state = nullptr;
    if (!ensureState(displayName, dc, state)) {
        DeleteDC(dc);
        return Napi::Boolean::New(env, false);
    }

    std::vector<WORD> ramp(state->baseRamp.size());
    const uint64_t scale = static_cast<uint64_t>(requested);
    for (size_t i = 0; i < ramp.size(); i++) {
        ramp[i] = static_cast<WORD>((static_cast<uint64_t>(state->baseRamp[i]) * scale + 50) / 100);
    }
    const bool ok = SetDeviceGammaRamp(dc, ramp.data()) != FALSE;
    DeleteDC(dc);
    if (ok) state->brightness = static_cast<int>(requested);
    return Napi::Boolean::New(env, ok);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("getBrightness", Napi::Function::New(env, getBrightness));
    exports.Set("setBrightness", Napi::Function::New(env, setBrightness));
    return exports;
}

} // namespace

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
