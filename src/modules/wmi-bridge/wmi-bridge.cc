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

// Set up COM stuff once
bool wmiConnect() {
    if(wmiConnected == true) return true;
    hRes = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    if (FAILED(hRes))
    {
        cout << "Unable to launch COM: 0x" << std::hex << hRes << endl;
        return false;
    }

    if ((FAILED(hRes = CoInitializeSecurity(NULL, -1, NULL, NULL, RPC_C_AUTHN_LEVEL_CONNECT, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE, 0))))
    {
        cout << "Unable to initialize security: 0x" << std::hex << hRes << endl;
        return false;
    }
    wmiConnected = true;
    return true;
}

string bstr_to_str(BSTR source){
	//source = L"lol2inside";
	_bstr_t wrapped_bstr = _bstr_t(source);
	int length = wrapped_bstr.length();
	char* char_array = new char[length];
	strcpy_s(char_array, length+1, wrapped_bstr);
	return char_array;
}

// Used to read weird WMIMonitorID strings
string getWMIClassUINTString(HRESULT &hr, VARIANT &vtProp)
{
    string out = "";
    if (!FAILED(hr))
    {
        if ((vtProp.vt == VT_NULL) || (vtProp.vt == VT_EMPTY))
        {
        }
        else if ((vtProp.vt & VT_ARRAY))
        {
            long lLower, lUpper;
            UINT32 Element = NULL;
            SAFEARRAY *pSafeArray = vtProp.parray;
            SafeArrayGetLBound(pSafeArray, 1, &lLower);
            SafeArrayGetUBound(pSafeArray, 1, &lUpper);

            for (long i = lLower; i <= lUpper; i++)
            {
                hr = SafeArrayGetElement(pSafeArray, &i, &Element);
                if (Element != 0)
                {
                    out.push_back(char(Element));
                }
            }
            //SafeArrayDestroy(pSafeArray);
        }
    }
    VariantClear(&vtProp);
    return out;
}

Napi::Object getWMIBrightness(const Napi::CallbackInfo &info)
{
    using std::cin;
    using std::cout;
    using std::endl;

    // Monitors info
    Napi::Object monitor = Napi::Object::New(info.Env());

    // Failure/Error response
    Napi::Object failed = Napi::Object::New(info.Env());
    failed.Set("failed", Napi::Boolean::New(info.Env(), true));

    int brightness = -1;

    bool connected = wmiConnect();

    IWbemLocator *pLocator = NULL;
    if (FAILED(hRes = CoCreateInstance(CLSID_WbemLocator, NULL, CLSCTX_ALL, IID_PPV_ARGS(&pLocator))))
    {
        cout << "Unable to create a WbemLocator: " << std::hex << hRes << endl;
        return failed;
    }

    if (FAILED(hRes = pLocator->ConnectServer(L"root\\WMI", NULL, NULL, NULL, WBEM_FLAG_CONNECT_USE_MAX_WAIT, NULL, NULL, &pService)))
    {
        pLocator->Release();
        cout << "Unable to connect to \"WMI\": " << std::hex << hRes << endl;
        return failed;
    }

    IEnumWbemClassObject *pEnumerator = NULL;
    if (FAILED(hRes = pService->ExecQuery(L"WQL", L"SELECT * FROM WmiMonitorBrightness", WBEM_FLAG_FORWARD_ONLY, NULL, &pEnumerator)))
    {
        // Likely due to not being a laptop
        pLocator->Release();
        pService->Release();
        return failed;
    }

    IWbemClassObject *clsObj = NULL;
    int numElems;
    while ((hRes = pEnumerator->Next(WBEM_INFINITE, 1, &clsObj, (ULONG *)&numElems)) != WBEM_S_FALSE)
    {
        if (FAILED(hRes))
            break;

        VARIANT vRet;
        VariantInit(&vRet);
        if (SUCCEEDED(clsObj->Get(L"InstanceName", 0, &vRet, NULL, NULL)))
        {
            string InstanceName = bstr_to_str(vRet.bstrVal);
            monitor.Set("InstanceName", Napi::String::New(info.Env(), InstanceName));
            VariantClear(&vRet);
        }

        VariantInit(&vRet);
        if (SUCCEEDED(clsObj->Get(L"CurrentBrightness", 0, &vRet, NULL, NULL)))
        {
            brightness = vRet.intVal;
            monitor.Set("Brightness", Napi::Number::New(info.Env(), brightness));
            VariantClear(&vRet);
        }

        clsObj->Release();
    }

    pEnumerator->Release();
    pService->Release();
    pLocator->Release();
    return monitor;
}

Napi::Object getWMIMonitors(const Napi::CallbackInfo &info)
{
    using std::cin;
    using std::cout;
    using std::endl;

    // Monitors info
    Napi::Object monitors = Napi::Object::New(info.Env());

    // Failure/Error response
    Napi::Object failed = Napi::Object::New(info.Env());
    failed.Set("failed", Napi::Boolean::New(info.Env(), true));

    bool connected = wmiConnect();

    IWbemLocator *pLocator = NULL;
    if (FAILED(hRes = CoCreateInstance(CLSID_WbemLocator, NULL, CLSCTX_ALL, IID_PPV_ARGS(&pLocator))))
    {
        cout << "Unable to create a WbemLocator: " << std::hex << hRes << endl;
        return failed;
    }

    if (FAILED(hRes = pLocator->ConnectServer(L"root\\WMI", NULL, NULL, NULL, WBEM_FLAG_CONNECT_USE_MAX_WAIT, NULL, NULL, &pService)))
    {
        pLocator->Release();
        cout << "Unable to connect to \"WMI\": " << std::hex << hRes << endl;
        return failed;
    }

    IEnumWbemClassObject *pEnumerator = NULL;
    if (FAILED(hRes = pService->ExecQuery(L"WQL", L"SELECT * FROM WmiMonitorID", WBEM_FLAG_FORWARD_ONLY, NULL, &pEnumerator)))
    {
        pLocator->Release();
        pService->Release();
        cout << "Unable to retrive desktop monitors: " << std::hex << hRes << endl;
        return failed;
    }

    IWbemClassObject *clsObj = NULL;
    int numElems;
    while ((hRes = pEnumerator->Next(WBEM_INFINITE, 1, &clsObj, (ULONG *)&numElems)) != WBEM_S_FALSE)
    {
        if (FAILED(hRes))
            break;

        Napi::Object monitor = Napi::Object::New(info.Env());
        string InstanceName;

        VARIANT vRet;
        VariantInit(&vRet);
        if (SUCCEEDED(clsObj->Get(L"InstanceName", 0, &vRet, NULL, NULL)) && vRet.vt == VT_BSTR)
        {
            InstanceName = bstr_to_str(vRet.bstrVal);
            monitor.Set("InstanceName", Napi::String::New(info.Env(), InstanceName));
            VariantClear(&vRet);
        }

        vRet;
        VariantInit(&vRet);
        if (SUCCEEDED(clsObj->Get(L"Active", 0, &vRet, NULL, NULL)))
        {
            monitor.Set("Active", Napi::Boolean::New(info.Env(), vRet.boolVal));
            VariantClear(&vRet);
        }

        VARIANT vtProp;
        HRESULT hr = clsObj->Get(L"UserFriendlyName", 0, &vtProp, 0, 0);
        string UserFriendlyName = getWMIClassUINTString(hr, vtProp);
        monitor.Set("UserFriendlyName", Napi::String::New(info.Env(), UserFriendlyName));

        vtProp;
        hr = clsObj->Get(L"ManufacturerName", 0, &vtProp, 0, 0);
        string ManufacturerName = getWMIClassUINTString(hr, vtProp);
        monitor.Set("ManufacturerName", Napi::String::New(info.Env(), ManufacturerName));

        vtProp;
        hr = clsObj->Get(L"ProductCodeID", 0, &vtProp, 0, 0);
        string ProductCodeID = getWMIClassUINTString(hr, vtProp);
        monitor.Set("ProductCodeID", Napi::String::New(info.Env(), ProductCodeID));

        vtProp;
        hr = clsObj->Get(L"SerialNumberID", 0, &vtProp, 0, 0); 
        string SerialNumberID = getWMIClassUINTString(hr, vtProp);
        monitor.Set("SerialNumberID", Napi::String::New(info.Env(), SerialNumberID));

        monitors.Set(InstanceName, monitor);

        clsObj->Release();
    }

    pEnumerator->Release();
    pService->Release();
    pLocator->Release();
    return monitors;
}



bool setWMIBrightness(int brightness)
{
    //HRESULT hRes;

    bool connected = wmiConnect();

    IWbemLocator *pLocator = NULL;
    if (FAILED(hRes = CoCreateInstance(CLSID_WbemLocator, NULL, CLSCTX_ALL, IID_PPV_ARGS(&pLocator))))
    {
        cout << "Unable to create a WbemLocator: " << std::hex << hRes << endl;
        return false;
    }

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

    if (FAILED(hRes))
    {
        cout << "Could not connect. Error code = 0x"
             << hex << hRes << endl;
        pLocator->Release();
        CoUninitialize();
        return false;
    }

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

    if (FAILED(hRes))
    {
        cout << "Could not set proxy blanket. Error code = 0x"
             << hex << hRes << endl;
        pSvc->Release();
        pLocator->Release();
        CoUninitialize();
        return false;
    }

    // Step 6: --------------------------------------------------
    // Call WmiSetBrightness method -----------------------------

    // set up to call the Win32_Process::Create method
    BSTR ClassName = SysAllocString(L"WmiMonitorBrightnessMethods");
    BSTR MethodName = SysAllocString(L"WmiSetBrightness");
    BSTR bstrQuery = SysAllocString(L"Select * from WmiMonitorBrightnessMethods");
    IEnumWbemClassObject *pEnum = NULL;

    hRes = pSvc->ExecQuery(_bstr_t(L"WQL"),                                       //Query Language
                           bstrQuery,                                             //Query to Execute
                           WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, //Make a semi-synchronous call
                           NULL,                                                  //Context
                           &pEnum /*Enumeration Interface*/);

    hRes = WBEM_S_NO_ERROR;

    ULONG ulReturned;
    IWbemClassObject *pObj;
    DWORD retVal = 0;

    if (FAILED(hRes)) return false;

    //Get the Next Object from the collection
    hRes = pEnum->Next(WBEM_INFINITE, //Timeout
                       1,             //No of objects requested
                       &pObj,         //Returned Object
                       &ulReturned /*No of object returned*/);

    if (FAILED(hRes)) return false;

    IWbemClassObject *pClass = NULL;
    hRes = pSvc->GetObject(ClassName, 0, NULL, &pClass, NULL);
    if (FAILED(hRes)) return false;

    IWbemClassObject *pInParamsDefinition = NULL;
    hRes = pClass->GetMethod(MethodName, 0, &pInParamsDefinition, NULL);
    if (FAILED(hRes)) return false;

    IWbemClassObject *pClassInstance = NULL;
    hRes = pInParamsDefinition->SpawnInstance(0, &pClassInstance);
    if (FAILED(hRes)) return false;

    VARIANT var1;
    VariantInit(&var1);
    BSTR ArgName0 = SysAllocString(L"Timeout");

    V_VT(&var1) = VT_UI1;
    V_UI1(&var1) = 0;
    hRes = pClassInstance->Put(ArgName0,
                               0,
                               &var1,
                               CIM_UINT32); //CIM_UINT64
    if (FAILED(hRes)) return false;

    VARIANT var2;
    VariantInit(&var2);
    BSTR ArgName1 = SysAllocString(L"Brightness");

    V_VT(&var2) = VT_UI1;
    V_UI1(&var2) = brightness; //Brightness value
    hRes = pClassInstance->Put(ArgName1,
                               0,
                               &var2,
                               CIM_UINT8);
    if (FAILED(hRes)) return false;

    // Call the method
    VARIANT pathVariable;
    VariantInit(&pathVariable);

    hRes = pObj->Get(_bstr_t(L"__PATH"),
        0,
        &pathVariable,
        NULL,
        NULL);
    if (FAILED(hRes)) return false;

    hRes = pSvc->ExecMethod(pathVariable.bstrVal,
                            MethodName,
                            0,
                            NULL,
                            pClassInstance,
                            NULL,
                            NULL);
    if (FAILED(hRes)) return false;
    VariantClear(&var1);
    VariantClear(&var2);

    VariantClear(&pathVariable);
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
        catch (int e)
        {
        }
        return Napi::Boolean::New(info.Env(), ok);
    }
    catch (int e)
    {
        return Napi::Boolean::New(info.Env(), false);
    }
}

// Get WMI brightness (laptops/tablets)
Napi::Object getBrightness(const Napi::CallbackInfo &info)
{
    return getWMIBrightness(info);
}

// Get known monitor info from WMI
Napi::Object getMonitors(const Napi::CallbackInfo &info)
{
    return getWMIMonitors(info);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "setBrightness"),
                Napi::Function::New(env, setBrightness));
    exports.Set(Napi::String::New(env, "getBrightness"),
                Napi::Function::New(env, getBrightness));
    exports.Set(Napi::String::New(env, "getMonitors"),
                Napi::Function::New(env, getMonitors));

    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);