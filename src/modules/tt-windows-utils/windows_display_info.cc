#include <napi.h>
#pragma comment(lib, "windowsapp")
#include <winrt/Windows.Devices.Display.h>
#include <winrt/Windows.Devices.Enumeration.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.h>

#include <cmath>
#include <string>

using namespace winrt;
using namespace Windows::Devices::Display;
using namespace Windows::Devices::Enumeration;

std::string connectionKindToString(DisplayMonitorConnectionKind kind) {
  switch (kind) {
  case DisplayMonitorConnectionKind::Internal:
    return "internal";
  case DisplayMonitorConnectionKind::Wired:
    return "wired";
  case DisplayMonitorConnectionKind::Wireless:
    return "wireless";
  case DisplayMonitorConnectionKind::Virtual:
    return "virtual";
  }
  return "unknown";
}

std::string physicalConnectorToString(DisplayMonitorPhysicalConnectorKind kind) {
  switch (kind) {
  case DisplayMonitorPhysicalConnectorKind::HD15:
    return "vga";
  case DisplayMonitorPhysicalConnectorKind::AnalogTV:
    return "analogTV";
  case DisplayMonitorPhysicalConnectorKind::Dvi:
    return "dvi";
  case DisplayMonitorPhysicalConnectorKind::Hdmi:
    return "hdmi";
  case DisplayMonitorPhysicalConnectorKind::Lvds:
    return "lvds";
  case DisplayMonitorPhysicalConnectorKind::Sdi:
    return "sdi";
  case DisplayMonitorPhysicalConnectorKind::DisplayPort:
    return "displayPort";
  case DisplayMonitorPhysicalConnectorKind::Unknown:
    break;
  }
  return "unknown";
}

// Enumerates monitors via Windows.Devices.Display.DisplayMonitor.
// Provides definitive internal/external classification, physical size,
// and native resolution that the Win32 enumeration APIs don't expose.
Napi::Array getDisplayMonitors(const Napi::CallbackInfo &info) {
  Napi::Array out = Napi::Array::New(info.Env());
  int index = 0;

  // The monitor thread doesn't initialize COM on its own. WinRT needs an
  // apartment; use MTA to match the other native modules in this process.
  static bool apartmentAttempted = false;
  if (!apartmentAttempted) {
    apartmentAttempted = true;
    try {
      winrt::init_apartment(winrt::apartment_type::multi_threaded);
    } catch (...) {
      // Already initialized by the host. Existing apartment is usable.
    }
  }

  try {
    auto devices_async =
        DeviceInformation::FindAllAsync(DisplayMonitor::GetDeviceSelector());
    if (devices_async.wait_for(std::chrono::milliseconds{2000}) !=
        Windows::Foundation::AsyncStatus::Completed) {
      return out;
    }
    auto devices = devices_async.get();

    for (auto const &device : devices) {
      try {
        auto monitor_async = DisplayMonitor::FromInterfaceIdAsync(device.Id());
        if (monitor_async.wait_for(std::chrono::milliseconds{1000}) !=
            Windows::Foundation::AsyncStatus::Completed) {
          continue;
        }
        DisplayMonitor monitor = monitor_async.get();
        if (monitor == nullptr)
          continue;

        Napi::Object monitorObj = Napi::Object::New(info.Env());

        // e.g. "\\?\DISPLAY#ABC1234#5&...&UID4352#{GUID}" - same shape as
        // the device paths used by the other enumeration sources.
        monitorObj.Set("deviceInterfaceId",
                       Napi::String::New(info.Env(),
                                         winrt::to_string(device.Id())));
        monitorObj.Set(
            "deviceInstanceId",
            Napi::String::New(info.Env(),
                              winrt::to_string(monitor.DeviceId())));

        monitorObj.Set("name",
                       Napi::String::New(
                           info.Env(),
                           winrt::to_string(monitor.DisplayName())));

        monitorObj.Set("connectionKind",
                       Napi::String::New(
                           info.Env(),
                           connectionKindToString(monitor.ConnectionKind())));
        monitorObj.Set(
            "physicalConnector",
            Napi::String::New(
                info.Env(),
                physicalConnectorToString(monitor.PhysicalConnector())));

        auto resolution = monitor.NativeResolutionInRawPixels();
        monitorObj.Set("nativeWidth",
                       Napi::Number::New(info.Env(), resolution.Width));
        monitorObj.Set("nativeHeight",
                       Napi::Number::New(info.Env(), resolution.Height));

        auto physicalSize = monitor.PhysicalSizeInInches();
        if (physicalSize != nullptr) {
          float width = physicalSize.Value().Width;
          float height = physicalSize.Value().Height;
          monitorObj.Set("physicalWidth", Napi::Number::New(info.Env(), width));
          monitorObj.Set("physicalHeight",
                         Napi::Number::New(info.Env(), height));
          monitorObj.Set(
              "physicalDiagonal",
              Napi::Number::New(
                  info.Env(),
                  std::sqrt((double)width * width + (double)height * height)));
        }

        out.Set(index++, monitorObj);
      } catch (...) {
        // Skip monitors that fail to resolve; keep enumerating the rest.
      }
    }
  } catch (...) {
  }

  return out;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "getDisplayMonitors"),
              Napi::Function::New(env, getDisplayMonitors));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);
