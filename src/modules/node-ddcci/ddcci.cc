#include <napi.h>

#include "HighLevelMonitorConfigurationAPI.h"
#include "LowLevelMonitorConfigurationAPI.h"
#include "PhysicalMonitorEnumerationAPI.h"
#include "windows.h"
#include "winuser.h"

#include <iostream>
#include <map>
#include <sstream>
#include <vector>


std::map<std::string, HANDLE> handles;
std::map<std::string, std::string> capabilities;

void
populateHandlesMap(bool filterResults)
{
    // Cleanup
    if (!handles.empty()) {
        for (auto const& handle : handles) {
            DestroyPhysicalMonitor(handle.second);
        }
        handles.clear();
    }
    if (!capabilities.empty()) {
        capabilities.clear();
    }

    struct Monitor {
        HMONITOR handle;
        std::vector<HANDLE> physicalHandles;
        std::vector<std::string> capabilitiesStrings;
    };

    auto monitorEnumProc = [](HMONITOR hMonitor,
                              HDC hdcMonitor,
                              LPRECT lprcMonitor,
                              LPARAM dwData) -> BOOL {
        auto monitors = reinterpret_cast<std::vector<struct Monitor>*>(dwData);
        monitors->push_back({ hMonitor, {} });
        return TRUE;
    };

    std::vector<struct Monitor> monitors;
    EnumDisplayMonitors(
      NULL, NULL, monitorEnumProc, reinterpret_cast<LPARAM>(&monitors));

    // Get physical monitor handles
    for (auto& monitor : monitors) {
        DWORD numPhysicalMonitors;
        LPPHYSICAL_MONITOR physicalMonitors = NULL;
        if (!GetNumberOfPhysicalMonitorsFromHMONITOR(monitor.handle,
                                                     &numPhysicalMonitors)) {
            throw std::runtime_error("Failed to get physical monitor count.");
            exit(EXIT_FAILURE);
        }

        physicalMonitors = new PHYSICAL_MONITOR[numPhysicalMonitors];
        if (physicalMonitors == NULL) {
            throw std::runtime_error(
              "Failed to allocate physical monitor array");
        }

        if (!GetPhysicalMonitorsFromHMONITOR(
              monitor.handle, numPhysicalMonitors, physicalMonitors)) {
            throw std::runtime_error("Failed to get physical monitors.");
        }

        for (DWORD i = 0; i <= numPhysicalMonitors; i++) {

            /**
             * Loop through physical monitors, check capabilities,
             * and only include ones that work.
             */

            DWORD cchStringLength = 0;
            BOOL bSuccess = 0;
            LPSTR szCapabilitiesString = NULL;

            // Get the length of the string.
            bSuccess = GetCapabilitiesStringLength(
              physicalMonitors[i].hPhysicalMonitor, // Handle to the monitor.
              &cchStringLength);

            if (bSuccess != true) {
                continue; // Does not respond to DDC/CI
            } else {
                // Allocate the string buffer.
                LPSTR szCapabilitiesString = (LPSTR)malloc(cchStringLength);
                if (szCapabilitiesString != NULL) {
                    // Get the capabilities string.
                    bSuccess = CapabilitiesRequestAndCapabilitiesReply(
                      physicalMonitors[i].hPhysicalMonitor,
                      szCapabilitiesString,
                      cchStringLength);

                    monitor.capabilitiesStrings.push_back(
                      std::string(szCapabilitiesString));

                    // Free the string buffer.
                    free(szCapabilitiesString);
                }
            }

            monitor.physicalHandles.push_back(
              physicalMonitors[i].hPhysicalMonitor);
        }

        delete[] physicalMonitors;
    }


    DISPLAY_DEVICE adapterDev;
    adapterDev.cb = sizeof(DISPLAY_DEVICE);

    // Loop through adapters
    int adapterDevIndex = 0;
    while (EnumDisplayDevices(NULL, adapterDevIndex++, &adapterDev, 0)) {
        DISPLAY_DEVICE displayDev;
        displayDev.cb = sizeof(DISPLAY_DEVICE);

        // Loop through displays (with device ID) on each adapter
        int displayDevIndex = 0;
        while (EnumDisplayDevices(adapterDev.DeviceName,
                                  displayDevIndex++,
                                  &displayDev,
                                  EDD_GET_DEVICE_INTERFACE_NAME)) {

            // Check valid target
            if (filterResults == true && !(displayDev.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP)
                || displayDev.StateFlags & DISPLAY_DEVICE_MIRRORING_DRIVER) {
                continue;
            }

            for (auto const& monitor : monitors) {
                MONITORINFOEX monitorInfo;
                monitorInfo.cbSize = sizeof(MONITORINFOEX);
                GetMonitorInfo(monitor.handle, &monitorInfo);

                for (size_t i = 0; i < monitor.physicalHandles.size(); i++) {
                    /**
                     * Re-create DISPLAY_DEVICE.DeviceName with
                     * MONITORINFOEX.szDevice and monitor index.
                     */

                    std::string monitorName =
                      static_cast<std::string>(monitorInfo.szDevice) + "\\";

                    std::string deviceName =
                      static_cast<std::string>(displayDev.DeviceName);

                    // Match and store against device ID
                    if (deviceName.rfind(monitorName) == 0) {
                        std::cout << "-- MATCH: " + static_cast<std::string>(deviceName + " " + displayDev.DeviceID) << std::endl;
                        handles.insert(
                          { static_cast<std::string>(displayDev.DeviceID),
                            monitor.physicalHandles[i] });
                        capabilities.insert(
                          { static_cast<std::string>(displayDev.DeviceID),
                            monitor.capabilitiesStrings[i] });
                    }
                }
            }
        }
    }
}


std::string
getLastErrorString()
{
    DWORD errorCode = GetLastError();
    if (!errorCode) {
        return std::string();
    }

    LPSTR buf = NULL;
    DWORD size =
      FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM
                      | FORMAT_MESSAGE_IGNORE_INSERTS,
                    NULL,
                    errorCode,
                    LANG_SYSTEM_DEFAULT,
                    (LPSTR)&buf,
                    0,
                    NULL);

    std::string message(buf, size);
    return message;
}

Napi::Value
refresh(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        throw Napi::TypeError::New(env, "Not enough arguments");
    }
    if (!info[0].IsBoolean()) {
        throw Napi::TypeError::New(env, "Invalid arguments");
    }

    try {
        populateHandlesMap(info[0].As<Napi::Boolean>());
    } catch (std::runtime_error& e) {
        throw Napi::Error::New(env, e.what());
    }

    return env.Undefined();
}


Napi::Array
getMonitorList(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Array ret = Napi::Array::New(env, handles.size());

    int i = 0;
    for (auto const& handle : handles) {
        ret.Set(i++, handle.first);
    }

    return ret;
}


Napi::Value
setVCP(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 3) {
        throw Napi::TypeError::New(env, "Not enough arguments");
    }
    if (!info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber()) {
        throw Napi::TypeError::New(env, "Invalid arguments");
    }

    std::string monitorName = info[0].As<Napi::String>().Utf8Value();
    BYTE vcpCode = static_cast<BYTE>(info[1].As<Napi::Number>().Int32Value());
    DWORD newValue =
      static_cast<DWORD>(info[2].As<Napi::Number>().Int32Value());

    auto it = handles.find(monitorName);
    if (it == handles.end()) {
        throw Napi::Error::New(env, "Monitor not found");
    }

    if (!SetVCPFeature(it->second, vcpCode, newValue)) {
        throw Napi::Error::New(env,
                               std::string("Failed to set VCP code value\n")
                                 + getLastErrorString());
    }

    return env.Undefined();
}

Napi::Value
getVCP(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        throw Napi::TypeError::New(env, "Not enough arguments");
    }
    if (!info[0].IsString() || !info[1].IsNumber()) {
        throw Napi::TypeError::New(env, "Invalid arguments");
    }

    std::string monitorName = info[0].As<Napi::String>().Utf8Value();
    BYTE vcpCode = static_cast<BYTE>(info[1].As<Napi::Number>().Int32Value());

    auto it = handles.find(monitorName);
    if (it == handles.end()) {
        throw Napi::Error::New(env, "Monitor not found");
    }

    DWORD currentValue;
    DWORD maxValue;
    if (!GetVCPFeatureAndVCPFeatureReply(
          it->second, vcpCode, NULL, &currentValue, &maxValue)) {
        throw Napi::Error::New(env,
                               std::string("Failed to get VCP code value\n")
                                 + getLastErrorString());
    }

    Napi::Array ret = Napi::Array::New(env, 2);
    ret.Set((uint32_t)0, static_cast<double>(currentValue));
    ret.Set((uint32_t)1, static_cast<double>(maxValue));

    return ret;
}

Napi::String
getCapabilities(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        throw Napi::TypeError::New(env, "Not enough arguments");
    }
    if (!info[0].IsString()) {
        throw Napi::TypeError::New(env, "Invalid arguments");
    }

    std::string monitorName = info[0].As<Napi::String>().Utf8Value();

    auto it = capabilities.find(monitorName);
    if (it == capabilities.end()) {
        throw Napi::Error::New(env, "Monitor not found");
    }

    return Napi::String::New(env, it->second);
}


Napi::Boolean
saveCurrentSettings(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        throw Napi::TypeError::New(env, "Not enough arguments");
    }
    if (!info[0].IsString()) {
        throw Napi::TypeError::New(env, "Invalid arguments");
    }

    std::string monitorName = info[0].As<Napi::String>().Utf8Value();

    auto it = handles.find(monitorName);
    if (it == handles.end()) {
        throw Napi::Error::New(env, "Monitor not found");
    }


    BOOL bSuccess = 0;
    bSuccess = SaveCurrentSettings(it->second);

    return Napi::Boolean::New(env, bSuccess);
}

Napi::Object
Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("getMonitorList",
                Napi::Function::New(env, getMonitorList, "getMonitorList"));
    exports.Set("refresh", Napi::Function::New(env, refresh, "refresh"));
    exports.Set("setVCP", Napi::Function::New(env, setVCP, "setVCP"));
    exports.Set("getVCP", Napi::Function::New(env, getVCP, "getVCP"));
    exports.Set("getCapabilities", Napi::Function::New(env, getCapabilities, "getCapabilities"));
    exports.Set("saveCurrentSettings", Napi::Function::New(env, saveCurrentSettings, "saveCurrentSettings"));

    try {
        populateHandlesMap(true);
    } catch (std::runtime_error& e) {
        throw Napi::Error::New(env, e.what());
    }

    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
