#include <napi.h>
#include <dwmapi.h>

enum AccentState {
    ACCENT_DISABLED = 0,
    ACCENT_ENABLE_GRADIENT = 1,
    ACCENT_ENABLE_TRANSPARENTGRADIENT = 2,
    ACCENT_ENABLE_BLURBEHIND = 3,
    ACCENT_ENABLE_ACRYLICBLURBEHIND = 4,
    ACCENT_INVALID_STATE = 5
};

enum WindowCompositionAttribute {
    WCA_ACCENT_POLICY = 19
};

struct AccentPolicy {
    AccentState accentState;
    int accentFlags;
    int gradientColor;
    int animationId;
};

struct WindowCompositionAttributeData {
    WindowCompositionAttribute attribute;
    PVOID pData;
    ULONG dataSize;
};

typedef BOOL(WINAPI
*pSetWindowCompositionAttribute)(HWND, WindowCompositionAttributeData*);

const HINSTANCE hModule = LoadLibrary(TEXT("user32.dll"));

void setVibrancy(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    try {
        if (info.Length() == 0) {
            Napi::TypeError::New(env, "WINDOW_NOT_GIVEN").ThrowAsJavaScriptException();
            return;
        }
        if (info.Length() != 6) {
            Napi::TypeError::New(env, "PARAMETER_ERROR").ThrowAsJavaScriptException();
            return;
        }
        if (!info[0].IsNumber()) {
            Napi::TypeError::New(env, "UNKNOWN").ThrowAsJavaScriptException();
            return;
        }
        HWND hWnd = (HWND) info[0].As<Napi::Number>().Int64Value();
        int isRS4OrGreater = info[1].As<Napi::Number>().Int32Value();

        int redValue = info[2].As<Napi::Number>().Int32Value();
        int greenValue = info[3].As<Napi::Number>().Int32Value();
        int blueValue = info[4].As<Napi::Number>().Int32Value();
        int alphaValue = info[5].As<Napi::Number>().Int32Value();

        if (hModule) {
            const pSetWindowCompositionAttribute SetWindowCompositionAttribute = (pSetWindowCompositionAttribute) GetProcAddress(
                    hModule, "SetWindowCompositionAttribute");
            if (SetWindowCompositionAttribute) {
                int gradientColor = (alphaValue<<24) + (blueValue<<16) + (greenValue<<8) + (redValue);
                AccentState blurType = isRS4OrGreater == 1 ? ACCENT_ENABLE_ACRYLICBLURBEHIND : ACCENT_ENABLE_BLURBEHIND;
                AccentPolicy policy = {blurType, 2, gradientColor, 0};
                WindowCompositionAttributeData data = {WCA_ACCENT_POLICY, &policy, sizeof(AccentPolicy)};
                SetWindowCompositionAttribute(hWnd, &data);
            } else {
                Napi::Error::New(env, "FAIL_LOAD_DLL").ThrowAsJavaScriptException();
                return;
            }
            FreeLibrary(hModule);
        } else {
            Napi::Error::New(env, "FAIL_LOAD_DLL").ThrowAsJavaScriptException();
            return;
        }
    } catch (const char *ex) {
        Napi::Error::New(env, "UNKNOWN").ThrowAsJavaScriptException();
    }
}

void disableVibrancy(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    try {
        if (info.Length() != 1) {
            Napi::TypeError::New(env, "WINDOW_NOT_GIVEN").ThrowAsJavaScriptException();
            return;
        }
        if (!info[0].IsNumber()) {
            Napi::TypeError::New(env, "UNKNOWN").ThrowAsJavaScriptException();
            return;
        }
        HWND hWnd = (HWND) info[0].As<Napi::Number>().Int64Value();
        if (hModule) {
            const pSetWindowCompositionAttribute SetWindowCompositionAttribute = (pSetWindowCompositionAttribute) GetProcAddress(
                    hModule, "SetWindowCompositionAttribute");
            if (SetWindowCompositionAttribute) {
                AccentPolicy policy = {ACCENT_DISABLED, 0, 0, 0};
                WindowCompositionAttributeData data = {WCA_ACCENT_POLICY, &policy, sizeof(AccentPolicy)};
                SetWindowCompositionAttribute(hWnd, &data);
            } else {
                Napi::Error::New(env, "FAIL_LOAD_DLL").ThrowAsJavaScriptException();
                return;
            }
            FreeLibrary(hModule);
        } else {
            Napi::Error::New(env, "FAIL_LOAD_DLL").ThrowAsJavaScriptException();
            return;
        }
    } catch (const char *ex) {
        Napi::Error::New(env, "UNKNOWN").ThrowAsJavaScriptException();
    }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "setVibrancy"),
                Napi::Function::New(env, setVibrancy));
    exports.Set(Napi::String::New(env, "disableVibrancy"),
                Napi::Function::New(env, disableVibrancy));
    return exports;
}

NODE_API_MODULE(vibrancy, Init
)