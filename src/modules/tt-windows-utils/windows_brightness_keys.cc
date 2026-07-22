#include <napi.h>
#include <windows.h>
#include <hidusage.h>
#include <hidpi.h>

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace {

constexpr USAGE kConsumerUsagePage = 0x0C;
constexpr USAGE kConsumerControlUsage = 0x01;
constexpr USAGE kBrightnessIncrementUsage = 0x006F;
constexpr USAGE kBrightnessDecrementUsage = 0x0070;

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

Napi::Boolean RegisterBrightnessKeys(const Napi::CallbackInfo& info)
{
    HWND hwnd = NULL;
    if (info.Length() < 1 || !GetWindowHandle(info[0], &hwnd) || hwnd == NULL) {
        return Napi::Boolean::New(info.Env(), false);
    }

    RAWINPUTDEVICE device = {};
    device.usUsagePage = kConsumerUsagePage;
    device.usUsage = kConsumerControlUsage;
    device.dwFlags = RIDEV_INPUTSINK;
    device.hwndTarget = hwnd;

    return Napi::Boolean::New(
      info.Env(), RegisterRawInputDevices(&device, 1, sizeof(device)) != FALSE);
}

Napi::Boolean UnregisterBrightnessKeys(const Napi::CallbackInfo& info)
{
    RAWINPUTDEVICE device = {};
    device.usUsagePage = kConsumerUsagePage;
    device.usUsage = kConsumerControlUsage;
    device.dwFlags = RIDEV_REMOVE;
    device.hwndTarget = NULL;

    return Napi::Boolean::New(
      info.Env(), RegisterRawInputDevices(&device, 1, sizeof(device)) != FALSE);
}

std::string ReadBrightnessKey(HRAWINPUT inputHandle)
{
    UINT inputSize = 0;
    if (GetRawInputData(inputHandle,
                        RID_INPUT,
                        NULL,
                        &inputSize,
                        sizeof(RAWINPUTHEADER)) == static_cast<UINT>(-1) ||
        inputSize < sizeof(RAWINPUTHEADER)) {
        return "";
    }

    std::vector<BYTE> inputBuffer(inputSize);
    if (GetRawInputData(inputHandle,
                        RID_INPUT,
                        inputBuffer.data(),
                        &inputSize,
                        sizeof(RAWINPUTHEADER)) == static_cast<UINT>(-1)) {
        return "";
    }

    RAWINPUT* input = reinterpret_cast<RAWINPUT*>(inputBuffer.data());
    if (input->header.dwType != RIM_TYPEHID || input->header.hDevice == NULL) {
        return "";
    }

    UINT preparsedSize = 0;
    if (GetRawInputDeviceInfo(input->header.hDevice,
                              RIDI_PREPARSEDDATA,
                              NULL,
                              &preparsedSize) == static_cast<UINT>(-1) ||
        preparsedSize == 0) {
        return "";
    }

    std::vector<BYTE> preparsedBuffer(preparsedSize);
    if (GetRawInputDeviceInfo(input->header.hDevice,
                              RIDI_PREPARSEDDATA,
                              preparsedBuffer.data(),
                              &preparsedSize) == static_cast<UINT>(-1)) {
        return "";
    }

    PHIDP_PREPARSED_DATA preparsedData =
      reinterpret_cast<PHIDP_PREPARSED_DATA>(preparsedBuffer.data());
    HIDP_CAPS capabilities = {};
    if (HidP_GetCaps(preparsedData, &capabilities) != HIDP_STATUS_SUCCESS ||
        capabilities.UsagePage != kConsumerUsagePage ||
        capabilities.Usage != kConsumerControlUsage) {
        return "";
    }

    const RAWHID& hid = input->data.hid;
    const size_t dataOffset = input->data.hid.bRawData - inputBuffer.data();
    const size_t rawDataSize =
      static_cast<size_t>(hid.dwSizeHid) * static_cast<size_t>(hid.dwCount);
    if (hid.dwSizeHid == 0 || hid.dwCount == 0 ||
        dataOffset > inputBuffer.size() ||
        rawDataSize > inputBuffer.size() - dataOffset) {
        return "";
    }

    const ULONG maxUsageCount = HidP_MaxUsageListLength(
      HidP_Input, kConsumerUsagePage, preparsedData);
    if (maxUsageCount == 0) return "";

    std::vector<USAGE> usages(maxUsageCount);
    bool parsedConsumerReport = false;
    for (DWORD reportIndex = 0; reportIndex < hid.dwCount; reportIndex++) {
        PCHAR report = reinterpret_cast<PCHAR>(
          input->data.hid.bRawData + (reportIndex * hid.dwSizeHid));
        ULONG usageCount = maxUsageCount;
        // This is a valid Consumer Control report even when its usage list is
        // empty (the documented key-release report uses usage value zero).
        parsedConsumerReport = true;
        NTSTATUS usageStatus = HidP_GetUsages(HidP_Input,
                                              kConsumerUsagePage,
                                              0,
                                              usages.data(),
                                              &usageCount,
                                              preparsedData,
                                              report,
                                              hid.dwSizeHid);
        if (usageStatus != HIDP_STATUS_SUCCESS) continue;
        for (ULONG usageIndex = 0; usageIndex < usageCount; usageIndex++) {
            if (usages[usageIndex] == kBrightnessIncrementUsage) return "up";
            if (usages[usageIndex] == kBrightnessDecrementUsage) return "down";
        }
    }

    // Consumer Control devices send a zero-usage report when a key is released.
    return parsedConsumerReport ? "release" : "";
}

Napi::String GetBrightnessKey(const Napi::CallbackInfo& info)
{
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        return Napi::String::New(info.Env(), "");
    }

    bool lossless = false;
    uint64_t rawHandle = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless || rawHandle == 0) {
        return Napi::String::New(info.Env(), "");
    }

    HRAWINPUT inputHandle = reinterpret_cast<HRAWINPUT>(
      static_cast<uintptr_t>(rawHandle));
    return Napi::String::New(info.Env(), ReadBrightnessKey(inputHandle));
}

} // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("register", Napi::Function::New(env, RegisterBrightnessKeys));
    exports.Set("unregister", Napi::Function::New(env, UnregisterBrightnessKeys));
    exports.Set("getKey", Napi::Function::New(env, GetBrightnessKey));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
