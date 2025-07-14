#define _WIN32_DCOM

#include <napi.h>
#include <windows.h>
#include <string>
#include <iostream>
#include <WbemCli.h>
#include <comdef.h>
#include "oaidl.h"
#include "oleauto.h"
using namespace std;

#pragma comment(lib, "wbemuuid.lib")

HRESULT hRes = CoInitializeEx(NULL, COINIT_MULTITHREADED);
IWbemServices *pService = NULL;
bool wmiConnected = false;
Napi::Object failedObj;

void p(string str)
{
    //cout << "Line: " << str << endl;
}

// Set up COM stuff once
bool wmiConnect()
{
    try {
        p("wmiConnect 1");
        if (wmiConnected == true)
            return true;
        p("wmiConnect 2");
        hRes = CoInitializeEx(NULL, COINIT_MULTITHREADED);
        if (FAILED(hRes))
        {
            cout << "Unable to launch COM: 0x" << std::hex << hRes << endl;
            return false;
        }
        p("wmiConnect 3");

        if ((FAILED(hRes = CoInitializeSecurity(NULL, -1, NULL, NULL, RPC_C_AUTHN_LEVEL_CONNECT, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE, 0))))
        {
            cout << "Unable to initialize security: 0x" << std::hex << hRes << endl;
            return false;
        }
        p("wmiConnect 4 END");
        wmiConnected = true;
        return true;
    } catch (...) {
        return false;
    }
}

// https://stackoverflow.com/questions/6284524/bstr-to-stdstring-stdwstring-and-vice-versa
std::string bstr_to_str(BSTR bstr)
{
    int wslen = ::SysStringLen(bstr);
    const wchar_t* pstr = (wchar_t*)bstr;
    int len = ::WideCharToMultiByte(CP_ACP, 0, pstr, wslen, NULL, 0, NULL, NULL);

    std::string dblstr(len, '\0');
    len = ::WideCharToMultiByte(CP_ACP, 0 /* no flags */,
                                pstr, wslen /* not necessary NULL-terminated */,
                                &dblstr[0], len,
                                NULL, NULL /* no default char */);
    return dblstr;
}

// Used to read weird WMIMonitorID strings
string getWMIClassUINTString(HRESULT &hr, VARIANT &vtProp)
{
    p("getWMIClassUINTString 1");
    string out = "";
    if (!FAILED(hr))
    {
        p("getWMIClassUINTString 2");
        if ((vtProp.vt == VT_NULL) || (vtProp.vt == VT_EMPTY))
        {
            p("getWMIClassUINTString 3a");
        }
        else if ((vtProp.vt & VT_ARRAY))
        {
            p("getWMIClassUINTString 3b");
            long lLower, lUpper;
            UINT32 Element = NULL;
            SAFEARRAY *pSafeArray = vtProp.parray;
            p("getWMIClassUINTString 4");
            SafeArrayGetLBound(pSafeArray, 1, &lLower);
            SafeArrayGetUBound(pSafeArray, 1, &lUpper);
            p("getWMIClassUINTString 5");

            for (long i = lLower; i <= lUpper; i++)
            {
                hr = SafeArrayGetElement(pSafeArray, &i, &Element);
                if (Element != 0)
                {
                    out.push_back(char(Element));
                }
            }
            p("getWMIClassUINTString 6");
            //SafeArrayDestroy(pSafeArray);
        }
    }
    p("getWMIClassUINTString 7");
    VariantClear(&vtProp);
    p("getWMIClassUINTString 8 END");
    return out;
}

Napi::Object getWMIBrightness(const Napi::CallbackInfo &info)
{
    using std::cin;
    using std::cout;
    using std::endl;
    p("getWMIBrightness 1");

    // Monitors info
    Napi::Object monitor = Napi::Object::New(info.Env());

    // Failure/Error response
    Napi::Object failed = Napi::Object::New(info.Env());
    failed.Set("failed", Napi::Boolean::New(info.Env(), true));

    try
    {
        int brightness = -1;

        bool connected = wmiConnect();
        p("getWMIBrightness 2");

        IWbemLocator *pLocator = NULL;
        if (FAILED(hRes = CoCreateInstance(CLSID_WbemLocator, NULL, CLSCTX_ALL, IID_PPV_ARGS(&pLocator))))
        {
            cout << "Unable to create a WbemLocator: " << std::hex << hRes << endl;
            return failed;
        }
        p("getWMIBrightness 3");

        if (FAILED(hRes = pLocator->ConnectServer(L"root\\WMI", NULL, NULL, NULL, WBEM_FLAG_CONNECT_USE_MAX_WAIT, NULL, NULL, &pService)))
        {
            pLocator->Release();
            cout << "Unable to connect to \"WMI\": " << std::hex << hRes << endl;
            return failed;
        }
        p("getWMIBrightness 4");

        IEnumWbemClassObject *pEnumerator = NULL;
        if (FAILED(hRes = pService->ExecQuery(L"WQL", L"SELECT * FROM WmiMonitorBrightness", WBEM_FLAG_FORWARD_ONLY, NULL, &pEnumerator)))
        {
            // Likely due to not being a laptop
            pLocator->Release();
            pService->Release();
            return failed;
        }
        p("getWMIBrightness 5");

        IWbemClassObject *clsObj = NULL;
        int numElems;
        while ((hRes = pEnumerator->Next(500, 1, &clsObj, (ULONG *)&numElems)) != WBEM_S_FALSE)
        {
            if (FAILED(hRes))
                break;

            VARIANT vRet;
            VariantInit(&vRet);
            p("getWMIBrightness 6a");
            if (SUCCEEDED(clsObj->Get(L"InstanceName", 0, &vRet, NULL, NULL)))
            {
                string InstanceName = bstr_to_str(vRet.bstrVal);
                monitor.Set("InstanceName", Napi::String::New(info.Env(), InstanceName));
                VariantClear(&vRet);
            }

            VariantInit(&vRet);
            p("getWMIBrightness 6b");
            if (SUCCEEDED(clsObj->Get(L"CurrentBrightness", 0, &vRet, NULL, NULL)))
            {
                brightness = vRet.intVal;
                monitor.Set("Brightness", Napi::Number::New(info.Env(), brightness));
                VariantClear(&vRet);
            }

            clsObj->Release();
        }
        p("getWMIBrightness 7");

        pEnumerator->Release();
        pService->Release();
        pLocator->Release();
        p("getWMIBrightness 8 END");
    }
    catch (...)
    {
        p("getWMIBrightness FAILED");
        return failed;
    }
    return monitor;
}

Napi::Object getWMIMonitors(const Napi::CallbackInfo &info)
{
    using std::cin;
    using std::cout;
    using std::endl;
    p("getWMIMonitors 1");

    // Monitors info
    Napi::Object monitors = Napi::Object::New(info.Env());

    // Failure/Error response
    Napi::Object failed = Napi::Object::New(info.Env());
    failed.Set("failed", Napi::Boolean::New(info.Env(), true));

    bool connected = wmiConnect();
    p("getWMIMonitors 2");

    try
    {
        IWbemLocator *pLocator = NULL;
        if (FAILED(hRes = CoCreateInstance(CLSID_WbemLocator, NULL, CLSCTX_ALL, IID_PPV_ARGS(&pLocator))))
        {
            cout << "Unable to create a WbemLocator: " << std::hex << hRes << endl;
            return failed;
        }
        p("getWMIMonitors 3");

        if (FAILED(hRes = pLocator->ConnectServer(L"root\\WMI", NULL, NULL, NULL, WBEM_FLAG_CONNECT_USE_MAX_WAIT, NULL, NULL, &pService)))
        {
            pLocator->Release();
            cout << "Unable to connect to \"WMI\": " << std::hex << hRes << endl;
            return failed;
        }
        p("getWMIMonitors 4");

        IEnumWbemClassObject *pEnumerator = NULL;
        if (FAILED(hRes = pService->ExecQuery(L"WQL", L"SELECT * FROM WmiMonitorID", WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, NULL, &pEnumerator)))
        {
            pLocator->Release();
            pService->Release();
            cout << "Unable to retrive desktop monitors: " << std::hex << hRes << endl;
            return failed;
        }
        p("getWMIMonitors 5");

        IWbemClassObject *clsObj = NULL;
        int numElems;
        while ((hRes = pEnumerator->Next(500, 1, &clsObj, (ULONG *)&numElems)) != WBEM_S_FALSE)
        {
            try
            {
                if (FAILED(hRes))
                    break;

                Napi::Object monitor = Napi::Object::New(info.Env());
                string InstanceName;

                VARIANT vRet;
                VariantInit(&vRet);
                p("getWMIMonitors 6");
                HRESULT hr = clsObj->Get(L"InstanceName", 0, &vRet, NULL, NULL);
                if (SUCCEEDED(hr) && vRet.vt == VT_BSTR)
                {
                    InstanceName = bstr_to_str(vRet.bstrVal);
                    monitor.Set("InstanceName", Napi::String::New(info.Env(), InstanceName));
                    VariantClear(&vRet);
                }
                p("getWMIMonitors 7");

                try
                {
                    VARIANT vtProp;
                    VariantInit(&vtProp);
                    HRESULT hr = clsObj->Get(L"UserFriendlyName", 0, &vtProp, 0, 0);
                    if (SUCCEEDED(hr))
                    {
                        string UserFriendlyName = getWMIClassUINTString(hr, vtProp);
                        monitor.Set("UserFriendlyName", Napi::String::New(info.Env(), UserFriendlyName));
                        p("getWMIMonitors 8");
                    }
                }
                catch (...)
                {
                    p("getWMIMonitors Loop failed to get optional values");
                }

                monitors.Set(InstanceName, monitor);
                p("getWMIMonitors 12");
            }
            catch (...)
            {
                p("getWMIMonitors loop failed");
            }

            clsObj->Release();
        }
        p("getWMIMonitors 13");
        pEnumerator->Release();
        pService->Release();
        pLocator->Release();
    }
    catch (...)
    {
        p("getWMIMonitors FAILED");
        return failed;
    }

    p("getWMIMonitors 14 END");
    return monitors;
}

bool setWMIBrightness(int brightness)
{
    p("setWMIBrightness 1");
    //HRESULT hRes;

    bool connected = wmiConnect();

    try
    {
        IWbemLocator *pLocator = NULL;
        if (FAILED(hRes = CoCreateInstance(CLSID_WbemLocator, NULL, CLSCTX_ALL, IID_PPV_ARGS(&pLocator))))
        {
            cout << "Unable to create a WbemLocator: " << std::hex << hRes << endl;
            return false;
        }
        p("setWMIBrightness 2");

        IWbemServices *pSvc = NULL;

        // Connect to the local root\wminamespace
        // and obtain pointer pSvc to make IWbemServices calls.
        hRes = pLocator->ConnectServer(
            _bstr_t(L"ROOT\\WMI"),
            NULL,
            NULL,
            0,
            NULL,
            0,
            0,
            &pSvc);
        p("setWMIBrightness 3");

        if (FAILED(hRes))
        {
            cout << "Could not connect. Error code = 0x"
                 << hex << hRes << endl;
            pLocator->Release();
            CoUninitialize();
            return false;
        }
        p("setWMIBrightness 4");

        // Step 5: --------------------------------------------------
        // Set security levels for the proxy ------------------------

        hRes = CoSetProxyBlanket(
            pSvc,                        // Indicates the proxy to set
            RPC_C_AUTHN_WINNT,           // RPC_C_AUTHN_xxx
            RPC_C_AUTHZ_NONE,            // RPC_C_AUTHZ_xxx
            NULL,                        // Server principal name
            RPC_C_AUTHN_LEVEL_CALL,      // RPC_C_AUTHN_LEVEL_xxx
            RPC_C_IMP_LEVEL_IMPERSONATE, // RPC_C_IMP_LEVEL_xxx
            NULL,                        // client identity
            EOAC_NONE                    // proxy capabilities
        );
        p("setWMIBrightness 5");

        if (FAILED(hRes))
        {
            cout << "Could not set proxy blanket. Error code = 0x"
                 << hex << hRes << endl;
            pSvc->Release();
            pLocator->Release();
            CoUninitialize();
            return false;
        }
        p("setWMIBrightness 6");

        // Step 6: --------------------------------------------------
        // Call WmiSetBrightness method -----------------------------

        // set up to call the Win32_Process::Create method
        BSTR ClassName = SysAllocString(L"WmiMonitorBrightnessMethods");
        BSTR MethodName = SysAllocString(L"WmiSetBrightness");
        BSTR bstrQuery = SysAllocString(L"Select * from WmiMonitorBrightnessMethods");
        IEnumWbemClassObject *pEnum = NULL;
        p("setWMIBrightness 7");

        hRes = pSvc->ExecQuery(_bstr_t(L"WQL"),                                       //Query Language
                               bstrQuery,                                             //Query to Execute
                               WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, //Make a semi-synchronous call
                               NULL,                                                  //Context
                               &pEnum /*Enumeration Interface*/);
        p("setWMIBrightness 8");

        hRes = WBEM_S_NO_ERROR;
        p("setWMIBrightness 9");

        ULONG ulReturned;
        IWbemClassObject *pObj;
        DWORD retVal = 0;

        if (FAILED(hRes))
            return false;
        p("setWMIBrightness 10");

        //Get the Next Object from the collection
        hRes = pEnum->Next(500, //Timeout
                           1,             //No of objects requested
                           &pObj,         //Returned Object
                           &ulReturned /*No of object returned*/);
        p("setWMIBrightness 11");

        if (FAILED(hRes))
            return false;
        p("setWMIBrightness 12");

        IWbemClassObject *pClass = NULL;
        hRes = pSvc->GetObject(ClassName, 0, NULL, &pClass, NULL);
        if (FAILED(hRes))
            return false;
        p("setWMIBrightness 13");

        IWbemClassObject *pInParamsDefinition = NULL;
        hRes = pClass->GetMethod(MethodName, 0, &pInParamsDefinition, NULL);
        if (FAILED(hRes))
            return false;
        p("setWMIBrightness 14");

        IWbemClassObject *pClassInstance = NULL;
        hRes = pInParamsDefinition->SpawnInstance(0, &pClassInstance);
        if (FAILED(hRes))
            return false;
        p("setWMIBrightness 15");

        VARIANT var1;
        VariantInit(&var1);
        BSTR ArgName0 = SysAllocString(L"Timeout");
        p("setWMIBrightness 16");

        V_VT(&var1) = VT_UI1;
        V_UI1(&var1) = 0;
        hRes = pClassInstance->Put(ArgName0,
                                   0,
                                   &var1,
                                   CIM_UINT32); //CIM_UINT64
        p("setWMIBrightness 17");
        if (FAILED(hRes))
            return false;

        VARIANT var2;
        VariantInit(&var2);
        BSTR ArgName1 = SysAllocString(L"Brightness");
        p("setWMIBrightness 18");

        V_VT(&var2) = VT_UI1;
        V_UI1(&var2) = brightness; //Brightness value
        hRes = pClassInstance->Put(ArgName1,
                                   0,
                                   &var2,
                                   CIM_UINT8);
        p("setWMIBrightness 19");
        if (FAILED(hRes))
            return false;

        // Call the method
        VARIANT pathVariable;
        VariantInit(&pathVariable);
        p("setWMIBrightness 20");

        hRes = pObj->Get(_bstr_t(L"__PATH"),
                         0,
                         &pathVariable,
                         NULL,
                         NULL);
        if (FAILED(hRes))
            return false;
        p("setWMIBrightness 21");

        hRes = pSvc->ExecMethod(pathVariable.bstrVal,
                                MethodName,
                                0,
                                NULL,
                                pClassInstance,
                                NULL,
                                NULL);
        p("setWMIBrightness 22");
        if (FAILED(hRes))
            return false;
        p("setWMIBrightness 23");
        VariantClear(&var1);
        VariantClear(&var2);
        p("setWMIBrightness 24");

        VariantClear(&pathVariable);
        p("setWMIBrightness 25 END");
    }
    catch (...)
    {
        p("setWMIBrightness FAILED");
        return false;
    }

    return !FAILED(hRes);
}

// Set WMI brightness (laptops/tablets)
Napi::Boolean setBrightness(const Napi::CallbackInfo &info)
{
    try
    {
        int level = info[0].ToNumber().Int32Value();
        bool ok = false;
        try
        {
            ok = setWMIBrightness(level);
        }
        catch (...)
        {

            p("setBrightness failed");
        }
        return Napi::Boolean::New(info.Env(), ok);
    }
    catch (...)
    {
        return Napi::Boolean::New(info.Env(), false);
    }
}

// Get WMI brightness (laptops/tablets)
Napi::Object getBrightness(const Napi::CallbackInfo &info)
{
    try
    {
        Napi::Object monInfo = getWMIBrightness(info);
        return monInfo;
    }
    catch (...)
    {
        return failedObj;
    }
}

// Get known monitor info from WMI
Napi::Object getMonitors(const Napi::CallbackInfo &info)
{
    try
    {
        Napi::Object monInfo = getWMIMonitors(info);
        return monInfo;
    }
    catch (...)
    {
        return failedObj;
    }
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    failedObj = Napi::Object::New(env);
    failedObj.Set("failed", Napi::Boolean::New(env, true));

    exports.Set(Napi::String::New(env, "setBrightness"),
                Napi::Function::New(env, setBrightness));
    exports.Set(Napi::String::New(env, "getBrightness"),
                Napi::Function::New(env, getBrightness));
    exports.Set(Napi::String::New(env, "getMonitors"),
                Napi::Function::New(env, getMonitors));

    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);