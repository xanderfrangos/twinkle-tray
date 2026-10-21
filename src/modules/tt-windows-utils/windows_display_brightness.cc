#include <napi.h>
#include <windows.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <limits>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

struct GammaState {
    std::vector<WORD> baseRamp;
    int brightness = 100;
};

std::map<std::wstring, GammaState> gammaStates;
std::mutex gammaMutex;
constexpr int kMinimumBrightness = 20;
constexpr int kMinimumDriverScale = 70;
constexpr int kMinimumReliableCurve = 60;
constexpr size_t kChannelEntries = 256;
constexpr size_t kGreenChannel = kChannelEntries;
constexpr int kSetAttempts = 3;
constexpr WORD kRampVerificationTolerance = 256;

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

bool rampsMatch(const std::vector<WORD>& expected, const std::vector<WORD>& actual)
{
    if (expected.size() != actual.size()) return false;
    for (size_t i = 0; i < expected.size(); i++) {
        const int difference = std::abs(static_cast<int>(expected[i]) - static_cast<int>(actual[i]));
        if (difference > kRampVerificationTolerance) return false;
    }
    return true;
}

struct BrightnessCurve {
    double requestedScale;
    double peakScale;
    double exponent;
};

BrightnessCurve curveForBrightness(int brightness)
{
    const double curveBrightness = kMinimumReliableCurve
        + ((brightness - kMinimumBrightness) * (100.0 - kMinimumReliableCurve)
            / (100.0 - kMinimumBrightness));

    BrightnessCurve curve;
    curve.requestedScale = curveBrightness / 100.0;
    curve.peakScale = (std::max)(curveBrightness, static_cast<double>(kMinimumDriverScale)) / 100.0;

    // Windows rejects very dark linear ramps. Below the driver-safe peak,
    // preserve that peak and darken mid-tones enough to match the requested
    // level at 50% input. This remains monotonic and passes the GDI safeguard.
    curve.exponent = curveBrightness < kMinimumDriverScale
        ? std::log((curve.requestedScale * 0.5) / curve.peakScale) / std::log(0.5)
        : 1.0;
    return curve;
}

std::vector<WORD> buildBrightnessRamp(const std::vector<WORD>& baseRamp, int brightness)
{
    const BrightnessCurve curve = curveForBrightness(brightness);
    std::vector<WORD> ramp(baseRamp.size());
    for (size_t i = 0; i < ramp.size(); i++) {
        const double normalized = baseRamp[i] / 65535.0;
        const double adjusted = curve.peakScale * std::pow(normalized, curve.exponent);
        ramp[i] = static_cast<WORD>(std::lround((std::min)(1.0, adjusted) * 65535.0));
    }
    return ramp;
}

std::vector<WORD> defaultRamp()
{
    std::vector<WORD> ramp(3 * kChannelEntries);
    for (size_t channel = 0; channel < 3; channel++) {
        for (size_t i = 0; i < kChannelEntries; i++) {
            ramp[(channel * kChannelEntries) + i] =
                static_cast<WORD>((std::min)(65535, static_cast<int>(i) * 257));
        }
    }
    return ramp;
}

// The brightness curve pins the mid-tone entry to an exact multiple of the
// requested scale, so that entry is where the level can be measured back out.
size_t midToneIndex(const std::vector<WORD>& baseRamp)
{
    size_t closest = kChannelEntries / 2;
    int smallest = (std::numeric_limits<int>::max)();
    for (size_t i = 0; i < kChannelEntries; i++) {
        const int difference = std::abs(static_cast<int>(baseRamp[kGreenChannel + i]) - 32768);
        if (difference < smallest) {
            smallest = difference;
            closest = i;
        }
    }
    return closest;
}

int brightnessFromRamp(const std::vector<WORD>& baseRamp, const std::vector<WORD>& ramp)
{
    if (baseRamp.size() != ramp.size() || ramp.size() < 3 * kChannelEntries) return 100;

    const size_t index = kGreenChannel + midToneIndex(baseRamp);
    const double baseMidTone = baseRamp[index] / 65535.0;
    if (baseMidTone <= 0.0) return 100;

    const double curveBrightness = ((ramp[index] / 65535.0) / baseMidTone) * 100.0;
    const double brightness = kMinimumBrightness
        + ((curveBrightness - kMinimumReliableCurve) * (100.0 - kMinimumBrightness)
            / (100.0 - kMinimumReliableCurve));
    return (std::max)(kMinimumBrightness, (std::min)(100, static_cast<int>(std::lround(brightness))));
}

// Undo the curve to recover the ramp a dimmed display started out with.
std::vector<WORD> restoreBaseRamp(const std::vector<WORD>& ramp, int brightness)
{
    const BrightnessCurve curve = curveForBrightness(brightness);
    if (curve.peakScale <= 0.0 || curve.exponent <= 0.0) return ramp;

    std::vector<WORD> baseRamp(ramp.size());
    for (size_t i = 0; i < ramp.size(); i++) {
        const double normalized = (std::min)(1.0, (ramp[i] / 65535.0) / curve.peakScale);
        baseRamp[i] = static_cast<WORD>(std::lround(std::pow(normalized, 1.0 / curve.exponent) * 65535.0));
    }
    return baseRamp;
}

// Works out the level when the ramp is our curve over the given base. Levels
// near the measured one are tried too, since drivers that keep fewer bits per
// entry can push the measurement a level or two either way.
bool levelFromRamp(const std::vector<WORD>& baseRamp, const std::vector<WORD>& ramp, int& level)
{
    const int measured = brightnessFromRamp(baseRamp, ramp);
    for (const int candidate : { measured, measured - 1, measured + 1, measured - 2, measured + 2 }) {
        if (candidate < kMinimumBrightness || candidate > 100) continue;
        if (rampsMatch(buildBrightnessRamp(baseRamp, candidate), ramp)) {
            level = candidate;
            return true;
        }
    }
    return false;
}

// Gamma ramps outlive the process, so a display can already be dimmed the first
// time it's read. Our curve lowers the peak of every channel, while calibration
// and colour tools (f.lux, Night light) leave at least one channel at full
// output. So only a ramp with every channel short of full is taken to be ours,
// and its peak gives the level without depending on the shape of the base.
GammaState stateFromRamp(const std::vector<WORD>& ramp)
{
    GammaState state;
    state.baseRamp = ramp;
    if (ramp.size() < 3 * kChannelEntries) return state;

    WORD top = 0;
    for (size_t channel = 0; channel < 3; channel++) {
        top = (std::max)(top, ramp[(channel * kChannelEntries) + kChannelEntries - 1]);
    }
    const double peak = (top / 65535.0) * 100.0;
    const double tolerance = (kRampVerificationTolerance / 65535.0) * 100.0;
    if (peak >= 100.0 - tolerance || peak < kMinimumDriverScale - tolerance) return state;

    int level;
    if (peak >= kMinimumDriverScale + (tolerance / 2)) {
        // Above the driver-safe peak the curve is a plain scale, so the peak is the level
        level = static_cast<int>(std::lround(kMinimumBrightness
            + ((peak - kMinimumReliableCurve) * (100.0 - kMinimumBrightness)
                / (100.0 - kMinimumReliableCurve))));
    } else {
        // The peak is pinned here, and only the mid-tones carry the level. There's
        // no base to measure them against, so a default ramp has to stand in.
        level = brightnessFromRamp(defaultRamp(), ramp);
    }
    level = (std::max)(kMinimumBrightness, (std::min)(99, level));
    state.brightness = level;
    state.baseRamp = restoreBaseRamp(ramp, level);
    return state;
}

// Brings the stored state in line with the ramp Windows currently has. If the
// ramp is no longer our curve over the stored base, something else replaced it
// (a display reset, a new colour profile, another app, or a renumbered display),
// so the base is taken from the ramp again instead of being reused.
bool syncState(const std::wstring& displayName, HDC dc, GammaState*& state)
{
    std::vector<WORD> current;
    if (!readRamp(dc, current)) return false;

    const std::wstring normalized = normalizeDisplayName(displayName);
    auto found = gammaStates.find(normalized);
    int level;
    if (found != gammaStates.end() && levelFromRamp(found->second.baseRamp, current, level)) {
        found->second.brightness = level;
        state = &found->second;
        return true;
    }
    state = &(gammaStates[normalized] = stateFromRamp(current));
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

    // Re-read the ramp rather than trusting the last value set here. Another
    // app, or an earlier session, may have changed it since.
    const bool initialized = syncState(displayName, dc, state);
    DeleteDC(dc);
    return Napi::Number::New(env, initialized ? state->brightness : -1);
}

Napi::Boolean setBrightness(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) return Napi::Boolean::New(env, false);
    const double requestedValue = info[1].As<Napi::Number>().DoubleValue();
    if (!std::isfinite(requestedValue) || requestedValue < 0 || requestedValue > 100 || std::floor(requestedValue) != requestedValue) {
        return Napi::Boolean::New(env, false);
    }
    const int requested = (std::max)(kMinimumBrightness, static_cast<int>(requestedValue));
    const std::wstring displayName = utf8ToWide(info[0].As<Napi::String>().Utf8Value());
    if (displayName.empty()) return Napi::Boolean::New(env, false);

    std::lock_guard<std::mutex> lock(gammaMutex);
    HDC dc = openDisplay(displayName);
    if (!dc) return Napi::Boolean::New(env, false);
    GammaState* state = nullptr;
    if (!syncState(displayName, dc, state)) {
        DeleteDC(dc);
        return Napi::Boolean::New(env, false);
    }
    DeleteDC(dc);

    std::vector<WORD> ramp = buildBrightnessRamp(state->baseRamp, requested);
    bool ok = false;
    for (int attempt = 0; attempt < kSetAttempts && !ok; attempt++) {
        dc = openDisplay(displayName);
        if (dc) {
            ok = SetDeviceGammaRamp(dc, ramp.data()) != FALSE;
            if (ok) {
                std::vector<WORD> appliedRamp;
                ok = readRamp(dc, appliedRamp) && rampsMatch(ramp, appliedRamp);
            }
            DeleteDC(dc);
        }
        if (!ok && attempt + 1 < kSetAttempts) {
            std::this_thread::sleep_for(std::chrono::milliseconds(20 * (attempt + 1)));
        }
    }
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
