#pragma once

#define WIN32_LEAN_AND_MEAN
#include <napi.h>
#include <windows.h>
#include <wrl/client.h>
#include <sensorsapi.h>
#include <sensors.h>
#include <propvarutil.h>
#include <initguid.h>
#include <wchar.h>
#include <string>
#include <vector>
#include <stdexcept>

// Helper function to convert GUID to string
std::string GuidToString(const GUID& guid) {
    wchar_t guidString[40];
    StringFromGUID2(guid, guidString, 40);
    
    char buffer[40];
    WideCharToMultiByte(CP_UTF8, 0, guidString, -1, buffer, 40, nullptr, nullptr);
    return std::string(buffer);
}

// Helper function to convert wide string to UTF-8
std::string WStringToString(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();
    
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.length(), nullptr, 0, nullptr, nullptr);
    std::string str(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.length(), &str[0], size_needed, nullptr, nullptr);
    return str;
}

// Helper function to get sensor state string
std::string GetSensorStateString(SensorState state) {
    switch (state) {
        case SENSOR_STATE_READY: return "ready";
        case SENSOR_STATE_NOT_AVAILABLE: return "not_available";
        case SENSOR_STATE_NO_DATA: return "no_data";
        case SENSOR_STATE_INITIALIZING: return "initializing";
        case SENSOR_STATE_ACCESS_DENIED: return "access_denied";
        default: return "error";
    }
}

using Microsoft::WRL::ComPtr;

class ComInit
{
public:
    explicit ComInit(DWORD coinit = COINIT_APARTMENTTHREADED) {
        const HRESULT hr = CoInitializeEx(nullptr, coinit);
        if (hr == S_OK) {
            owns = true;
        } else if (hr == S_FALSE) {
            // COM already initialized on this thread — do NOT uninitialize
            owns = false;
        } else {
            throw std::runtime_error("CoInitializeEx failed with HRESULT " + toHex(hr));
        }
    }

    ~ComInit() {
        if (owns) {
            CoUninitialize();
        }
    }

private:
    bool owns = false;

    static std::string toHex(HRESULT hr)
    {
        char buf[16];
        sprintf_s(buf, "0x%08X", static_cast<unsigned>(hr));
        return buf;
    }
};

struct SensorInfo {
    std::string id;
    std::string name;
    std::string state;
    double currentLux = 1.0;

    SensorInfo(const ComPtr<ISensor>& sensor)
    {
        if (!sensor) {
            return;
        }

        // Sensor ID
        SENSOR_ID sensorId;
        if (SUCCEEDED(sensor->GetID(&sensorId))) {
            id = GuidToString(sensorId);
        }

        // Friendly Name
        BSTR friendlyName = nullptr;
        if (SUCCEEDED(sensor->GetFriendlyName(&friendlyName))) {
            name = WStringToString(std::wstring(friendlyName));
            SysFreeString(friendlyName);
        }

        // Sensor State
        SensorState s;
        if (SUCCEEDED(sensor->GetState(&s))) {
            state = GetSensorStateString(s);
        }

        // Current Lux
        ComPtr<ISensorDataReport> report;
        if (SUCCEEDED(sensor->GetData(&report)) && report) {
            PROPVARIANT var;
            PropVariantInit(&var);

            if (SUCCEEDED(report->GetSensorValue(SENSOR_DATA_TYPE_LIGHT_LEVEL_LUX, &var))) {
                if (var.vt == VT_R4) {
                    currentLux = var.fltVal;
                } else if (var.vt == VT_R8) {
                    currentLux = var.dblVal;
                }
            }

            PropVariantClear(&var);
        }
    }
};

ComPtr<ISensorManager> GetSensorManager()
{
    ComInit com;

    ComPtr<ISensorManager> sensorManager;

    HRESULT hr = CoCreateInstance(
        CLSID_SensorManager,
        nullptr,
        CLSCTX_INPROC_SERVER,
        IID_PPV_ARGS(&sensorManager)
    );

    if (FAILED(hr) || !sensorManager) {
        throw std::runtime_error(
            "Failed to create ISensorManager: HRESULT " + std::to_string(hr)
        );
    }

    return sensorManager;
}

std::vector<ComPtr<ISensor>> GetSensors()
{
    ComInit com;

    const auto manager = GetSensorManager();

    ComPtr<ISensorCollection> sensorCollection;

    const auto hr = manager->GetSensorsByType(SENSOR_TYPE_AMBIENT_LIGHT, &sensorCollection);

    if (hr == HRESULT_FROM_WIN32(ERROR_NOT_FOUND)) { 
        return {}; 
    }

    if (FAILED(hr) || !sensorCollection) {
        throw std::runtime_error(
            "Failed to create ISensorCollection: HRESULT " + std::to_string(hr)
        );
    }

    ULONG count = 0;
    sensorCollection->GetCount(&count);

    std::vector<ComPtr<ISensor>> sensors;
    sensors.reserve(count);

    for (ULONG i = 0; i < count; ++i)
    {
        ComPtr<ISensor> sensor;
        sensorCollection->GetAt(i, &sensor);
        sensors.push_back(sensor);
    }

    return sensors;
}
