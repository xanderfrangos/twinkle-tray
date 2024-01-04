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

struct Monitor {
    HMONITOR handle;
    std::string monitorName;
    std::vector<HANDLE> physicalHandles;
};

struct PhysicalMonitor {
    HANDLE handle;
    bool ddcciSupported;
    std::string name;
    std::string fullName;
    std::string physicalName;
    std::string result;
    std::string deviceKey;
    std::string deviceID;
};

struct DisplayDevice {
    std::string adapterName;
    std::string deviceName;
    std::string deviceID;
    std::string deviceKey;
};

struct DisplayMonitor {
    std::string adapterName;
    std::list<HMONITOR> handles;
};

std::map<std::string, HANDLE> handles;
std::map<std::string, PhysicalMonitor> physicalMonitorHandles;
std::map<std::string, std::string> capabilities;

int logLevel = 0;

// Info
void
p(std::string s)
{
    if(logLevel = 1) {
        std::cout << "[node-ddcci] " + s << std::endl;
    }
}

// Debug
void
d(std::string s)
{
    if(logLevel = 2) {
        std::cout << "[node-ddcci] " + s << std::endl;
    }
}

void
clearMonitorData()
{
    if (!handles.empty()) {
        for (auto const& handle : handles) {
            DestroyPhysicalMonitor(handle.second);
        }
        handles.clear();
    }
    if (!physicalMonitorHandles.empty()) {
        for (auto const& physicalMonitor : physicalMonitorHandles) {
            DestroyPhysicalMonitor(physicalMonitor.second.handle);
        }
        physicalMonitorHandles.clear();
    }
    if (!capabilities.empty()) {
        capabilities.clear();
    }
}

std::string
getPhysicalMonitorName(HMONITOR handle)
{
    MONITORINFOEX monitorInfo;
    monitorInfo.cbSize = sizeof(MONITORINFOEX);
    GetMonitorInfo(handle, &monitorInfo);
    std::string monitorName =
      static_cast<std::string>(monitorInfo.szDevice);

    return monitorName;
}

std::map<std::string, DisplayDevice>
getAllDisplays(std::string keyType)
{
    std::map<std::string, DisplayDevice> out;

    DISPLAY_DEVICE adapterDev;
    adapterDev.cb = sizeof(DISPLAY_DEVICE);

    // Loop through adapters
    int adapterDevIndex = 0;
    while (EnumDisplayDevices(NULL, adapterDevIndex++, &adapterDev, 0)) {
        DISPLAY_DEVICE displayDev;
        displayDev.cb = sizeof(DISPLAY_DEVICE);

        // Check valid target
        if (!(adapterDev.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP)) {
            //continue;
        }

        // Loop through displays (with device ID) on each adapter
        int displayDevIndex = 0;
        while (EnumDisplayDevices(adapterDev.DeviceName,
                                  displayDevIndex++,
                                  &displayDev,
                                  EDD_GET_DEVICE_INTERFACE_NAME)) {

            // Check valid target
            if (!(displayDev.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP)) {
                continue;
            }

            std::string deviceName =
              static_cast<std::string>(displayDev.DeviceName);

            DisplayDevice newDevice;
            newDevice.adapterName = static_cast<std::string>(adapterDev.DeviceName);
            newDevice.deviceName = static_cast<std::string>(displayDev.DeviceName);
            newDevice.deviceID = static_cast<std::string>(displayDev.DeviceID);
            newDevice.deviceKey =
            newDevice.deviceID.substr(0, newDevice.deviceID.find("#{"));

            out.insert(
            { (keyType == "name" ? newDevice.deviceName : keyType == "adapter" ? newDevice.adapterName :  newDevice.deviceKey),
                newDevice });

        }
    }
    return out;
}

std::vector<struct Monitor>
getAllHandles() {
    std::vector<struct Monitor> monitors;

    auto monitorEnumProc = [](HMONITOR hMonitor,
                              HDC hdcMonitor,
                              LPRECT lprcMonitor,
                              LPARAM dwData) -> BOOL {
        auto monitors = reinterpret_cast<std::vector<struct Monitor>*>(dwData);
        monitors->push_back({ hMonitor, {} });
        return TRUE;
    };
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
            monitor.physicalHandles.push_back(
              physicalMonitors[i].hPhysicalMonitor);
        }

        monitor.monitorName = getPhysicalMonitorName(monitor.handle);
        delete[] physicalMonitors;
    }

    return monitors;
}

// Test if HANDLE has a working DDC/CI connection.
// Returns "invalid", "ok", or a capabilities string.
std::string
getPhysicalHandleResults(HANDLE handle, std::string validationMethod)
{
    if (validationMethod == "no-validation")
        return "ok";

    BOOL bSuccess = 0;

    // Accurate method: Check capabilities string
    if (validationMethod == "accurate") {
        DWORD cchStringLength = 0;
        BOOL bSuccess = 0;
        LPSTR szCapabilitiesString = NULL;

        // Get the length of the string.
        bSuccess = GetCapabilitiesStringLength(handle, // Handle to the monitor.
                                               &cchStringLength);

        if (bSuccess != 1) {
            return "invalid"; // Does not respond to DDC/CI
        }

        // Allocate the string buffer.
        szCapabilitiesString = (LPSTR)malloc(cchStringLength);
        if (szCapabilitiesString != NULL) {
            // Get the capabilities string.
            bSuccess = CapabilitiesRequestAndCapabilitiesReply(
              handle, szCapabilitiesString, cchStringLength);

            if (bSuccess != 1) {
                return "invalid"; // This shouldn't happen
            }

            std::string capabilities = std::string(szCapabilitiesString);

            // Free the string buffer before returning result.
            free(szCapabilitiesString);
            return capabilities;
        }
        return "invalid";
    }

    // Fast method: Check common VCP codes
    DWORD currentValue;
    DWORD maxValue;

    // 0x02, New Control Value
    if (GetVCPFeatureAndVCPFeatureReply(
          handle, 0x02, NULL, &currentValue, &maxValue)) {
        bSuccess = 1;
    }
    // 0xDF, VCP Version
    if (!bSuccess
        && GetVCPFeatureAndVCPFeatureReply(
          handle, 0xDF, NULL, &currentValue, &maxValue)) {
        bSuccess = 1;
    }
    // 0x10, Brightness (usually)
    if (!bSuccess
        && GetVCPFeatureAndVCPFeatureReply(
          handle, 0x10, NULL, &currentValue, &maxValue)) {
        bSuccess = 1;
    }

    if (bSuccess == 0) {
        return "invalid";
    }

    return "ok";
}

// Old method of detecting DDC/CI handles
void
populateHandlesMapLegacy()
{
    clearMonitorData();

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
            monitor.physicalHandles.push_back(
              physicalMonitors[(numPhysicalMonitors == 1 ? 0 : i)]
                .hPhysicalMonitor);
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
            if (!(displayDev.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP)
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
                      static_cast<std::string>(monitorInfo.szDevice)
                      + "\\Monitor" + std::to_string(i);

                    std::string deviceName =
                      static_cast<std::string>(displayDev.DeviceName);

                    std::string deviceID =
                      static_cast<std::string>(displayDev.DeviceID);
                    std::string deviceKey =
                      deviceID.substr(0, deviceID.find("#{"));

                    // Match and store against device ID
                    if (monitorName == deviceName) {
                        handles.insert({ static_cast<std::string>(deviceKey),
                                         monitor.physicalHandles[i] });

                        break;
                    }
                }
            }
        }
    }

    // Also update physicalMonitorHandles for use with getAllDisplays
    std::map<std::string, DisplayDevice> displays = getAllDisplays("key");

    for (auto const& handle : handles) {
        PhysicalMonitor newMonitor;
        newMonitor.handle = handle.second;
        newMonitor.ddcciSupported = true;

        auto it = displays.find(handle.first);
        if (it != displays.end()) {
            newMonitor.name = it->second.deviceName.substr(
              0, it->second.deviceName.find("Monitor"));
            newMonitor.fullName = it->second.deviceName;
            newMonitor.deviceKey = it->second.deviceKey;
            newMonitor.deviceID = it->second.deviceID;
        }

        physicalMonitorHandles.insert({ handle.first, newMonitor });
    }
}

void
populateHandlesMapNormal(std::string validationMethod, bool useExisting)
{
    std::map<std::string, HANDLE> newHandles;
    std::map<std::string, PhysicalMonitor> newPhysicalHandles;
    std::map<std::string, std::string> newCapabilities;

    d("Getting all display devices...");

    std::map<std::string, DisplayDevice> displays = getAllDisplays("name");
    for (auto const& display : displays) {
        d("-- Display: " + display.first);
        d("-- -- deviceName: " + display.second.deviceName);
        d("-- -- deviceID: " + display.second.deviceID);
        d("-- -- deviceKey: " + display.second.deviceKey);
    }
    
    d("Testing all physicalMonitors...");

    // Get physical monitor handles
    std::vector<struct Monitor> monitors = getAllHandles();
    for (auto& monitor : monitors) {
        for (DWORD i = 0; i <= monitor.physicalHandles.size(); i++) {

            /**
             * Loop through physical monitors, check capabilities,
             * and only include ones that work.
             */

            std::string fullMonitorName =
              monitor.monitorName + "\\" + "Monitor" + std::to_string(i);

            d("-- " + fullMonitorName);

            PhysicalMonitor newMonitor;
            newMonitor.handle = monitor.physicalHandles[i];
            newMonitor.name = monitor.monitorName;
            newMonitor.physicalName = fullMonitorName;
            newMonitor.ddcciSupported = false;

            // Match with DISPLAY_DEVICE list
            bool foundMatchingDisplay = false;
            int foundCount = 0;
            for (auto const& display : displays) {
                // Match with display number (e.g. "\\.\DISPLAY2")
                if(display.second.adapterName == monitor.monitorName) {
                    /**
                     * Match the physical monitor index with the index of found matching display numbers.
                     * For example, if all DISPLAY_DEVICE includes:
                     * - \\.\DISPLAY1\Monitor1
                     * - \\.\DISPLAY2\Monitor0
                     * - \\.\DISPLAY2\Monitor2
                     * 
                     * And the physical monitor name is \\.\DISPLAY2...
                     * And we're on physical monitor index 1 ("i == 1")...
                     * ...then we want \\.\DISPLAY2\Monitor2 because it is index 1 of the "\\.\DISPLAY2" DISPLAY_DEVICEs.
                     */
                    if(foundCount == i) {
                        newMonitor.deviceKey = display.second.deviceKey;
                        newMonitor.deviceID = display.second.deviceID;
                        newMonitor.fullName = display.second.deviceName;
                        foundMatchingDisplay = true;
                        d("-- -- Matched with: " + display.second.deviceKey);
                        break;
                    }
                    foundCount++;
                }
            }

            if(!foundMatchingDisplay) {
                d("-- -- Couldn't find match. Skipping.");
                break;
            }

            // Check if monitor was previously tested and supported
            if(useExisting) {
                for (auto const& previousDisplay : physicalMonitorHandles) {
                    if(previousDisplay.second.fullName == newMonitor.fullName && previousDisplay.second.deviceID == newMonitor.deviceID && previousDisplay.second.ddcciSupported) {
                        newMonitor.result = previousDisplay.second.result;
                        newMonitor.ddcciSupported = previousDisplay.second.ddcciSupported;
                        break;
                    }
                }
            }

            // Test DDC/CI
            if (newMonitor.ddcciSupported == false) {
                std::string result = getPhysicalHandleResults(
                  newMonitor.handle, validationMethod);

                newMonitor.result = result;
                d("-- -- DDC/CI: " + result);                

                if (result == "invalid") {
                    newMonitor.ddcciSupported = false;
                } else {
                    newMonitor.ddcciSupported = true;
                }
            } else {
                d("-- -- DDC/CI: previously OK");
            }

            // Add to monitor list
            newPhysicalHandles.insert({ newMonitor.fullName, newMonitor });
            newHandles.insert({ newMonitor.deviceKey, newMonitor.handle });

            // Add to capabilities list
            if (validationMethod == "accurate" && newMonitor.result != "ok"
                && newMonitor.result != "invalid") {
                newCapabilities.insert(
                    { newMonitor.deviceKey, newMonitor.result });
            }
        }
    }

    clearMonitorData();
    handles = newHandles;
    physicalMonitorHandles = newPhysicalHandles;
    capabilities = newCapabilities;
}

void
populateHandlesMap(std::string validationMethod)
{
    if (validationMethod == "legacy")
        return populateHandlesMapLegacy();

    if (validationMethod == "accurate" || validationMethod == "no-validation")
        return populateHandlesMapNormal(validationMethod, true);

    return populateHandlesMapNormal("fast", true);
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
    if (!info[0].IsString()) {
        throw Napi::TypeError::New(env, "Invalid arguments");
    }

    try {
        populateHandlesMap(info[0].As<Napi::String>().Utf8Value());
    } catch (std::runtime_error& e) {
        throw Napi::Error::New(env, e.what());
    }

    return env.Undefined();
}

void
clearDisplayCache(const Napi::CallbackInfo& info)
{
    if (!physicalMonitorHandles.empty()) {
        physicalMonitorHandles.clear();
    }
    if (!capabilities.empty()) {
        capabilities.clear();
    }
}

Napi::String
getCapabilitiesString(const Napi::CallbackInfo& info)
{

    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        throw Napi::TypeError::New(env, "Not enough arguments");
    }
    if (!info[0].IsString()) {
        throw Napi::TypeError::New(env, "Invalid arguments");
    }

    std::string monitorName = info[0].As<Napi::String>().Utf8Value();

    // Check if it's already saved in memory first.
    auto found = capabilities.find(monitorName);
    if (found != capabilities.end()) {
        return Napi::String::New(env, found->second);
    }

    auto it = handles.find(monitorName);
    if (it == handles.end()) {
        throw Napi::Error::New(env, "Monitor not found");
    }

    DWORD cchStringLength = 0;
    BOOL bSuccess = 0;
    LPSTR szCapabilitiesString = NULL;

    std::string returnString = "";

    // Get the length of the string.
    bSuccess = GetCapabilitiesStringLength(it->second, // Handle to the monitor.
                                           &cchStringLength);

    if (bSuccess != 1) {
        throw Napi::Error::New(
          env, "Monitor not responding."); // Does not respond to DDC/CI
    } else {
        // Allocate the string buffer.
        LPSTR szCapabilitiesString = (LPSTR)malloc(cchStringLength);
        if (szCapabilitiesString != NULL) {
            // Get the capabilities string.
            bSuccess = CapabilitiesRequestAndCapabilitiesReply(
              it->second, szCapabilitiesString, cchStringLength);

            returnString = std::string(szCapabilitiesString);

            // Free the string buffer.
            free(szCapabilitiesString);
        }
    }

    return Napi::String::New(env, returnString);
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

Napi::Array
getAllMonitors(const Napi::CallbackInfo& info)
{
    napi_env env = info.Env();
    Napi::Array monitors = Napi::Array::New(env);

    int i = 0;
    for (auto const& handle : physicalMonitorHandles) {
        Napi::Object monitor = Napi::Object::New(env);
        monitor.Set("ddcciSupported",
                    Napi::Boolean::New(env, handle.second.ddcciSupported));
        monitor.Set("name", Napi::String::New(env, handle.second.name));
        monitor.Set("fullName", Napi::String::New(env, handle.second.fullName));
        monitor.Set("physicalName", Napi::String::New(env, handle.second.physicalName));
        monitor.Set("result", Napi::String::New(env, handle.second.result));
        monitor.Set("deviceKey",
                    Napi::String::New(env, handle.second.deviceKey));
        monitor.Set("deviceID", Napi::String::New(env, handle.second.deviceID));

        monitors.Set(i++, monitor);
    }

    return monitors;
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

void
setLogLevel(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        throw Napi::TypeError::New(env, "Not enough arguments");
    }
    if (!info[0].IsNumber()) {
        throw Napi::TypeError::New(env, "Invalid arguments");
    }

    logLevel = (int)info[0].ToNumber();
}

Napi::Object
Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("getMonitorList",
                Napi::Function::New(env, getMonitorList, "getMonitorList"));
    exports.Set("getAllMonitors",
                Napi::Function::New(env, getAllMonitors, "getAllMonitors"));
    exports.Set(
      "clearDisplayCache",
      Napi::Function::New(env, clearDisplayCache, "clearDisplayCache"));
    exports.Set("refresh", Napi::Function::New(env, refresh, "refresh"));
    exports.Set("setVCP", Napi::Function::New(env, setVCP, "setVCP"));
    exports.Set("getVCP", Napi::Function::New(env, getVCP, "getVCP"));
    exports.Set(
      "getCapabilitiesString",
      Napi::Function::New(env, getCapabilitiesString, "getCapabilitiesString"));
    exports.Set(
      "saveCurrentSettings",
      Napi::Function::New(env, saveCurrentSettings, "saveCurrentSettings"));
    exports.Set("setLogLevel", Napi::Function::New(env, setLogLevel, "setLogLevel"));

    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
