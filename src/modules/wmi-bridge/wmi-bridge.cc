#define _WIN32_DCOM

#include <napi.h>
#include <windows.h>
#include <string>
#include <mutex>
#include <cmath>
#include <thread>
#include <atomic>
#include <memory>
#include <chrono>
#include <WbemCli.h>
#include <comdef.h>
#include <wrl/client.h>
#include "oaidl.h"
#include "oleauto.h"

using Microsoft::WRL::ComPtr;
using namespace std;

#pragma comment(lib, "wbemuuid.lib")

void p(string str)
{
    //cout << "Line: " << str << endl;
}

class ComScope {
  public:
    ComScope()
      : result(CoInitializeEx(NULL, COINIT_MULTITHREADED))
      , shouldUninitialize(SUCCEEDED(result))
    {
    }

    ~ComScope()
    {
        if (shouldUninitialize) {
            CoUninitialize();
        }
    }

    bool isUsable() const
    {
        // A host may have initialized this thread as STA already. COM remains
        // usable in that case, but this scope must not uninitialize it.
        return SUCCEEDED(result) || result == RPC_E_CHANGED_MODE;
    }

  private:
    HRESULT result;
    bool shouldUninitialize;
};

std::mutex securityInitializationMutex;

bool initializeWmiSecurity()
{
    // ComScope can tear down and later reinitialize COM between calls. COM
    // security must therefore be initialized for the current COM lifetime,
    // rather than cached for the lifetime of the addon.
    std::lock_guard<std::mutex> lock(securityInitializationMutex);
    HRESULT securityResult = CoInitializeSecurity(NULL,
                                                   -1,
                                                   NULL,
                                                   NULL,
                                                   RPC_C_AUTHN_LEVEL_CONNECT,
                                                   RPC_C_IMP_LEVEL_IMPERSONATE,
                                                   NULL,
                                                   EOAC_NONE,
                                                   0);

    // Another component may have configured process-wide COM security
    // before the addon is loaded. That configuration is usable here.
    if (securityResult == RPC_E_TOO_LATE) {
        securityResult = S_OK;
    }

    return SUCCEEDED(securityResult);
}

Napi::Object makeFailure(const Napi::Env& env)
{
    Napi::Object failed = Napi::Object::New(env);
    failed.Set("failed", Napi::Boolean::New(env, true));
    return failed;
}

std::string bstr_to_str(BSTR bstr)
{
    if (bstr == NULL) {
        return "";
    }

    int wslen = ::SysStringLen(bstr);
    if (wslen == 0) {
        return "";
    }

    int len = ::WideCharToMultiByte(CP_ACP, 0, bstr, wslen, NULL, 0, NULL, NULL);
    if (len <= 0) {
        return "";
    }

    std::string result(len, '\0');
    if (::WideCharToMultiByte(CP_ACP, 0, bstr, wslen, &result[0], len, NULL, NULL) == 0) {
        return "";
    }
    return result;
}

// Used to read WMIMonitorID's UINT16 string properties.
std::string getWMIClassUINTString(HRESULT hr, VARIANT& value)
{
    std::string output;

    if (SUCCEEDED(hr) && (value.vt & VT_ARRAY) && value.parray != NULL) {
        long lower = 0;
        long upper = -1;
        if (SUCCEEDED(SafeArrayGetLBound(value.parray, 1, &lower))
            && SUCCEEDED(SafeArrayGetUBound(value.parray, 1, &upper))) {
            for (long i = lower; i <= upper; i++) {
                USHORT element = 0;
                if (SUCCEEDED(SafeArrayGetElement(value.parray, &i, &element))
                    && element != 0) {
                    output.push_back(static_cast<char>(element));
                }
            }
        }
    }

    VariantClear(&value);
    return output;
}

bool connectToWmi(ComPtr<IWbemLocator>& locator, ComPtr<IWbemServices>& service)
{
    HRESULT hr = CoCreateInstance(CLSID_WbemLocator,
                                  NULL,
                                  CLSCTX_ALL,
                                  IID_PPV_ARGS(locator.GetAddressOf()));
    if (FAILED(hr)) {
        return false;
    }

    _bstr_t namespacePath(L"ROOT\\WMI");
    hr = locator->ConnectServer(namespacePath,
                                NULL,
                                NULL,
                                NULL,
                                WBEM_FLAG_CONNECT_USE_MAX_WAIT,
                                NULL,
                                NULL,
                                service.GetAddressOf());
    return SUCCEEDED(hr);
}

Napi::Object getWMIBrightness(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Object failed = makeFailure(env);
    ComScope com;
    if (!com.isUsable() || !initializeWmiSecurity()) {
        return failed;
    }

    ComPtr<IWbemLocator> locator;
    ComPtr<IWbemServices> service;
    if (!connectToWmi(locator, service)) {
        return failed;
    }

    ComPtr<IEnumWbemClassObject> enumerator;
    HRESULT hr = service->ExecQuery(L"WQL",
                                    L"SELECT * FROM WmiMonitorBrightness",
                                    WBEM_FLAG_FORWARD_ONLY,
                                    NULL,
                                    enumerator.GetAddressOf());
    if (FAILED(hr)) {
        return failed;
    }

    while (true) {
        ComPtr<IWbemClassObject> clsObj;
        ULONG returned = 0;
        hr = enumerator->Next(500, 1, clsObj.GetAddressOf(), &returned);
        if (FAILED(hr) || returned == 0 || !clsObj) {
            break;
        }

        VARIANT instanceName;
        VariantInit(&instanceName);
        HRESULT instanceResult = clsObj->Get(L"InstanceName", 0, &instanceName, NULL, NULL);
        if (FAILED(instanceResult) || instanceName.vt != VT_BSTR) {
            VariantClear(&instanceName);
            continue;
        }

        std::string instance = bstr_to_str(instanceName.bstrVal);
        VariantClear(&instanceName);

        VARIANT brightnessValue;
        VariantInit(&brightnessValue);
        HRESULT brightnessResult = clsObj->Get(
          L"CurrentBrightness", 0, &brightnessValue, NULL, NULL);
        if (FAILED(brightnessResult)) {
            VariantClear(&brightnessValue);
            continue;
        }

        VARIANT brightnessAsInt;
        VariantInit(&brightnessAsInt);
        HRESULT conversionResult = VariantChangeType(
          &brightnessAsInt, &brightnessValue, 0, VT_I4);
        VariantClear(&brightnessValue);
        if (FAILED(conversionResult)) {
            VariantClear(&brightnessAsInt);
            continue;
        }

        Napi::Object monitor = Napi::Object::New(env);
        monitor.Set("InstanceName", Napi::String::New(env, instance));
        monitor.Set("Brightness", Napi::Number::New(env, brightnessAsInt.lVal));
        VariantClear(&brightnessAsInt);

        // The public API returns one brightness value. Preserve its existing
        // first-valid-result behavior rather than relying on WMI enumeration
        // order to overwrite it with a later entry.
        return monitor;
    }

    return failed;
}

Napi::Object getWMIMonitors(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Object failed = makeFailure(env);
    ComScope com;
    if (!com.isUsable() || !initializeWmiSecurity()) {
        return failed;
    }

    ComPtr<IWbemLocator> locator;
    ComPtr<IWbemServices> service;
    if (!connectToWmi(locator, service)) {
        return failed;
    }

    ComPtr<IEnumWbemClassObject> enumerator;
    HRESULT hr = service->ExecQuery(L"WQL",
                                    L"SELECT * FROM WmiMonitorID",
                                    WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                                    NULL,
                                    enumerator.GetAddressOf());
    if (FAILED(hr)) {
        return failed;
    }

    Napi::Object monitors = Napi::Object::New(env);
    while (true) {
        ComPtr<IWbemClassObject> clsObj;
        ULONG returned = 0;
        hr = enumerator->Next(500, 1, clsObj.GetAddressOf(), &returned);
        if (FAILED(hr) || returned == 0 || !clsObj) {
            break;
        }

        VARIANT instanceName;
        VariantInit(&instanceName);
        HRESULT instanceResult = clsObj->Get(L"InstanceName", 0, &instanceName, NULL, NULL);
        if (FAILED(instanceResult) || instanceName.vt != VT_BSTR) {
            VariantClear(&instanceName);
            continue;
        }

        std::string instance = bstr_to_str(instanceName.bstrVal);
        VariantClear(&instanceName);
        if (instance.empty()) {
            continue;
        }

        Napi::Object monitor = Napi::Object::New(env);
        monitor.Set("InstanceName", Napi::String::New(env, instance));

        VARIANT friendlyName;
        VariantInit(&friendlyName);
        HRESULT friendlyNameResult = clsObj->Get(
          L"UserFriendlyName", 0, &friendlyName, NULL, NULL);
        if (SUCCEEDED(friendlyNameResult)) {
            monitor.Set("UserFriendlyName",
                        Napi::String::New(env,
                                          getWMIClassUINTString(
                                            friendlyNameResult, friendlyName)));
        } else {
            VariantClear(&friendlyName);
        }

        monitors.Set(instance, monitor);
    }

    return monitors;
}

bool setWMIBrightness(int brightness)
{
    if (brightness < 0 || brightness > 100) {
        return false;
    }

    ComScope com;
    if (!com.isUsable() || !initializeWmiSecurity()) {
        return false;
    }

    ComPtr<IWbemLocator> locator;
    ComPtr<IWbemServices> service;
    if (!connectToWmi(locator, service)) {
        return false;
    }

    HRESULT hr = CoSetProxyBlanket(service.Get(),
                                   RPC_C_AUTHN_WINNT,
                                   RPC_C_AUTHZ_NONE,
                                   NULL,
                                   RPC_C_AUTHN_LEVEL_CALL,
                                   RPC_C_IMP_LEVEL_IMPERSONATE,
                                   NULL,
                                   EOAC_NONE);
    if (FAILED(hr)) {
        return false;
    }

    ComPtr<IEnumWbemClassObject> enumerator;
    hr = service->ExecQuery(L"WQL",
                            L"SELECT * FROM WmiMonitorBrightnessMethods",
                            WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                            NULL,
                            enumerator.GetAddressOf());
    if (FAILED(hr) || !enumerator) {
        return false;
    }

    ComPtr<IWbemClassObject> methodObject;
    ULONG returned = 0;
    hr = enumerator->Next(500, 1, methodObject.GetAddressOf(), &returned);
    if (FAILED(hr) || returned == 0 || !methodObject) {
        return false;
    }

    ComPtr<IWbemClassObject> methodClass;
    hr = service->GetObject(L"WmiMonitorBrightnessMethods",
                            0,
                            NULL,
                            methodClass.GetAddressOf(),
                            NULL);
    if (FAILED(hr)) {
        return false;
    }

    ComPtr<IWbemClassObject> inputDefinition;
    hr = methodClass->GetMethod(L"WmiSetBrightness",
                                0,
                                inputDefinition.GetAddressOf(),
                                NULL);
    if (FAILED(hr)) {
        return false;
    }

    ComPtr<IWbemClassObject> inputParameters;
    hr = inputDefinition->SpawnInstance(0, inputParameters.GetAddressOf());
    if (FAILED(hr)) {
        return false;
    }

    _variant_t timeout;
    timeout.vt = VT_UI1;
    timeout.bVal = 0;
    hr = inputParameters->Put(L"Timeout", 0, &timeout, CIM_UINT32);
    if (FAILED(hr)) {
        return false;
    }

    _variant_t brightnessValue;
    brightnessValue.vt = VT_UI1;
    brightnessValue.bVal = static_cast<BYTE>(brightness);
    hr = inputParameters->Put(L"Brightness", 0, &brightnessValue, CIM_UINT8);
    if (FAILED(hr)) {
        return false;
    }

    _variant_t objectPath;
    hr = methodObject->Get(L"__PATH", 0, &objectPath, NULL, NULL);
    if (FAILED(hr) || objectPath.vt != VT_BSTR) {
        return false;
    }

    _bstr_t methodName(L"WmiSetBrightness");
    hr = service->ExecMethod(objectPath.bstrVal,
                             methodName,
                             0,
                             NULL,
                             inputParameters.Get(),
                             NULL,
                             NULL);
    return SUCCEEDED(hr);
}

Napi::Boolean setBrightness(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        return Napi::Boolean::New(env, false);
    }

    double requestedLevel = info[0].As<Napi::Number>().DoubleValue();
    if (!std::isfinite(requestedLevel)
        || requestedLevel < 0
        || requestedLevel > 100
        || std::floor(requestedLevel) != requestedLevel) {
        return Napi::Boolean::New(env, false);
    }

    return Napi::Boolean::New(env, setWMIBrightness(static_cast<int>(requestedLevel)));
}

//
// Brightness change notifications (WmiMonitorBrightnessEvent)
//

struct BrightnessEvent {
    std::string instanceName;
    int brightness = -1;
    bool active = true;
};

void callJsBrightnessEvent(Napi::Env env,
                           Napi::Function callback,
                           std::nullptr_t* /*context*/,
                           BrightnessEvent* event)
{
    if (env != nullptr && callback != nullptr && event != nullptr) {
        Napi::Object out = Napi::Object::New(env);
        out.Set("InstanceName", Napi::String::New(env, event->instanceName));
        out.Set("Brightness", Napi::Number::New(env, event->brightness));
        out.Set("Active", Napi::Boolean::New(env, event->active));
        callback.Call({ out });
    }
    delete event;
}

using BrightnessEventCallback =
  Napi::TypedThreadSafeFunction<std::nullptr_t, BrightnessEvent, callJsBrightnessEvent>;

std::mutex watcherMutex;
std::shared_ptr<std::atomic<bool>> watcherStopFlag;

int readWmiEventInt(IWbemClassObject* obj, const wchar_t* name, int fallback)
{
    VARIANT value;
    VariantInit(&value);
    if (FAILED(obj->Get(name, 0, &value, NULL, NULL))) {
        VariantClear(&value);
        return fallback;
    }

    VARIANT asInt;
    VariantInit(&asInt);
    HRESULT hr = VariantChangeType(&asInt, &value, 0, VT_I4);
    VariantClear(&value);
    if (FAILED(hr)) {
        VariantClear(&asInt);
        return fallback;
    }

    int result = asInt.lVal;
    VariantClear(&asInt);
    return result;
}

void brightnessWatcherThreadProc(BrightnessEventCallback callback,
                                 std::shared_ptr<std::atomic<bool>> shouldStop)
{
    ComScope com;
    if (!com.isUsable() || !initializeWmiSecurity()) {
        shouldStop->store(true);
        callback.Release();
        return;
    }

    while (!shouldStop->load()) {
        ComPtr<IWbemLocator> locator;
        ComPtr<IWbemServices> service;
        ComPtr<IEnumWbemClassObject> enumerator;

        HRESULT hr = E_FAIL;
        if (connectToWmi(locator, service)) {
            hr = service->ExecNotificationQuery(
              L"WQL",
              L"SELECT * FROM WmiMonitorBrightnessEvent",
              WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
              NULL,
              enumerator.GetAddressOf());
        }

        if (FAILED(hr) || !enumerator) {
            // The event class doesn't exist on systems without a
            // WMI-controllable display, so there is nothing to watch.
            if (hr == WBEM_E_INVALID_CLASS || hr == WBEM_E_INVALID_QUERY
                || hr == WBEM_E_NOT_SUPPORTED || hr == WBEM_E_NOT_FOUND) {
                break;
            }
            // Otherwise (e.g. the WMI service is restarting), wait and retry.
            for (int i = 0; i < 50 && !shouldStop->load(); i++) {
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }
            continue;
        }

        while (!shouldStop->load()) {
            ComPtr<IWbemClassObject> event;
            ULONG returned = 0;
            hr = enumerator->Next(1000, 1, event.GetAddressOf(), &returned);
            if (hr == WBEM_S_TIMEDOUT) {
                continue;
            }
            if (FAILED(hr) || returned == 0 || !event) {
                // Connection died. Reconnect via the outer loop.
                break;
            }

            VARIANT instanceName;
            VariantInit(&instanceName);
            HRESULT instanceResult =
              event->Get(L"InstanceName", 0, &instanceName, NULL, NULL);
            std::string instance;
            if (SUCCEEDED(instanceResult) && instanceName.vt == VT_BSTR) {
                instance = bstr_to_str(instanceName.bstrVal);
            }
            VariantClear(&instanceName);

            BrightnessEvent* data = new BrightnessEvent();
            data->instanceName = instance;
            data->brightness = readWmiEventInt(event.Get(), L"Brightness", -1);
            data->active = (readWmiEventInt(event.Get(), L"Active", 1) != 0);

            if (callback.BlockingCall(data) != napi_ok) {
                // The environment is shutting down.
                delete data;
                shouldStop->store(true);
                break;
            }
        }
    }

    shouldStop->store(true);
    callback.Release();
}

Napi::Boolean startBrightnessWatcher(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        return Napi::Boolean::New(env, false);
    }

    std::lock_guard<std::mutex> lock(watcherMutex);
    if (watcherStopFlag && !watcherStopFlag->load()) {
        // Already running
        return Napi::Boolean::New(env, true);
    }

    auto stopFlag = std::make_shared<std::atomic<bool>>(false);
    BrightnessEventCallback callback = BrightnessEventCallback::New(
      env, info[0].As<Napi::Function>(), "wmiBrightnessWatcher", 0, 1);
    // The watcher must not keep the process alive on its own.
    callback.Unref(env);

    try {
        // The thread owns its copy of the callback and releases it on exit.
        std::thread(brightnessWatcherThreadProc, callback, stopFlag).detach();
    } catch (...) {
        callback.Release();
        return Napi::Boolean::New(env, false);
    }

    watcherStopFlag = stopFlag;
    return Napi::Boolean::New(env, true);
}

Napi::Boolean stopBrightnessWatcher(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    std::lock_guard<std::mutex> lock(watcherMutex);
    if (!watcherStopFlag || watcherStopFlag->load()) {
        return Napi::Boolean::New(env, false);
    }
    watcherStopFlag->store(true);
    return Napi::Boolean::New(env, true);
}

Napi::Object getBrightness(const Napi::CallbackInfo& info)
{
    try {
        return getWMIBrightness(info);
    } catch (...) {
        return makeFailure(info.Env());
    }
}

Napi::Object getMonitors(const Napi::CallbackInfo& info)
{
    try {
        return getWMIMonitors(info);
    } catch (...) {
        return makeFailure(info.Env());
    }
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "setBrightness"),
                Napi::Function::New(env, setBrightness));
    exports.Set(Napi::String::New(env, "getBrightness"),
                Napi::Function::New(env, getBrightness));
    exports.Set(Napi::String::New(env, "getMonitors"),
                Napi::Function::New(env, getMonitors));
    exports.Set(Napi::String::New(env, "startBrightnessWatcher"),
                Napi::Function::New(env, startBrightnessWatcher));
    exports.Set(Napi::String::New(env, "stopBrightnessWatcher"),
                Napi::Function::New(env, stopBrightnessWatcher));

    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);
