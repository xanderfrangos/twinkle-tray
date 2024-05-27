#include <napi.h>
#include <windows.h>
#include <dwmapi.h>
#pragma comment(lib, "dwmapi")  

Napi::Boolean SetWindowPosition(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    Napi::Number hwndAfter = info[1].As<Napi::Number>();
    Napi::Number X = info[2].As<Napi::Number>();
    Napi::Number Y = info[3].As<Napi::Number>();
    Napi::Number width = info[4].As<Napi::Number>();
    Napi::Number height = info[5].As<Napi::Number>();
    Napi::Number flags = info[6].As<Napi::Number>();

    boolean result = SetWindowPos((HWND) hwnd.Int32Value(), (HWND) hwndAfter.Int32Value(), X, Y, width, height, flags);

    return Napi::Boolean::New(info.Env(), result);
}

Napi::Number GetForegroundWin(const Napi::CallbackInfo& info) {
    HWND result = GetForegroundWindow();

    return Napi::Number::New(info.Env(), (long) result);
}

Napi::Boolean SetForegroundWin(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();

    boolean result = SetForegroundWindow((HWND) hwnd.Int32Value());

    return Napi::Boolean::New(info.Env(), result);
}

Napi::Boolean SetWinLong(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    Napi::Number index = info[1].As<Napi::Number>();
    Napi::Number longVal = info[2].As<Napi::Number>();

    SetWindowLongPtr((HWND) hwnd.Int32Value(), (int) index.Int32Value(), ((LONG_PTR) longVal.Int32Value()));

    return Napi::Boolean::New(info.Env(), true);
}

Napi::Number GetWinLong(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    Napi::Number index = info[1].As<Napi::Number>();

    LONG_PTR result = GetWindowLongPtr((HWND) hwnd.Int32Value(), (int) index.Int32Value());

    return Napi::Number::New(info.Env(), result);
}

Napi::Boolean SetWinRgn(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    Napi::Boolean redraw = info[1].As<Napi::Boolean>();
    Napi::Number x1 = info[2].As<Napi::Number>();
    Napi::Number y1 = info[3].As<Napi::Number>();
    Napi::Number x2 = info[4].As<Napi::Number>();
    Napi::Number y2 = info[5].As<Napi::Number>();

    HRGN region = CreateRectRgn((int) x1.Int32Value(), (int) y1.Int32Value(), (int) x2.Int32Value(), (int) y2.Int32Value());

    SetWindowRgn((HWND) hwnd.Int32Value(), region, ((bool) redraw));

    return Napi::Boolean::New(info.Env(), true);
}

Napi::Boolean SetParentWindow(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    Napi::Number hwndNewParent = info[1].As<Napi::Number>();

    SetParent((HWND) hwnd.Int32Value(), (HWND) hwndNewParent.Int32Value());

    return Napi::Boolean::New(info.Env(), true);
}

Napi::Boolean SetBackdrop(const Napi::CallbackInfo& info) {
    Napi::Number hwnd = info[0].As<Napi::Number>();
    Napi::Number dwAttribute = info[1].As<Napi::Number>();
    //Napi::Number pvAttribute = info[2].As<Napi::Number>();
    Napi::Number cbAttribute = info[3].As<Napi::Number>();

    DWM_SYSTEMBACKDROP_TYPE pvAttribute = DWM_SYSTEMBACKDROP_TYPE::DWMSBT_MAINWINDOW;
    DWM_SYSTEMBACKDROP_TYPE* pvAttributePtr = &pvAttribute;

    DwmSetWindowAttribute((HWND) hwnd.Int32Value(), DWMWA_SYSTEMBACKDROP_TYPE, (LPCVOID) pvAttributePtr, sizeof(pvAttribute));

    return Napi::Boolean::New(info.Env(), true);
}



LRESULT CALLBACK WndProc(HWND hwnd, UINT Msg, WPARAM wParam, LPARAM lParam);

LRESULT CALLBACK WndProc(HWND hwnd, UINT Msg, WPARAM wParam, LPARAM lParam)
{
    switch(Msg)
    {
    case WM_DESTROY:
        PostQuitMessage(WM_QUIT);
        break;
	case WM_PAINT:
		{
			/* */
	PAINTSTRUCT ps;
	HDC         hdc;
	RECT        rc;
	hdc = BeginPaint(hwnd, &ps);

	GetClientRect(hwnd, &rc);
	//SetTextColor(hdc, 0);
	//SetBkMode(hdc, TRANSPARENT);
	//DrawText(hdc, "HELLO WORLD", -1, &rc, DT_CENTER|DT_SINGLELINE|DT_VCENTER);

	EndPaint(hwnd, &ps);
	/* */
            break;
		}
		break;
    default:
        return DefWindowProc(hwnd, Msg, wParam, lParam);
    }
    return 0;
}

Napi::Number CreateWin(const Napi::CallbackInfo& info) {
    Napi::Number dwExStyle = info[0].As<Napi::Number>();
    Napi::String className = info[1].As<Napi::String>();
    Napi::String windowName = info[2].As<Napi::String>();
    Napi::Number dwStyle = info[3].As<Napi::Number>();
    Napi::Number x = info[4].As<Napi::Number>();
    Napi::Number y = info[5].As<Napi::Number>();
    Napi::Number width = info[6].As<Napi::Number>();
    Napi::Number height = info[7].As<Napi::Number>();
    Napi::Number hwndParent = info[8].As<Napi::Number>();

    HINSTANCE hInstance = GetModuleHandle(NULL);

	MSG         Msg;
    WNDCLASSEXA  WndClsEx = {0};

    WndClsEx.cbSize        = sizeof (WNDCLASSEX);
    WndClsEx.style         = CS_HREDRAW | CS_VREDRAW;
    WndClsEx.lpfnWndProc   = WndProc;
    WndClsEx.hInstance     = hInstance;
    WndClsEx.hbrBackground = (HBRUSH)GetStockObject(WHITE_BRUSH);
    WndClsEx.lpszClassName = std::string("setwindowpos_class").c_str();
    WndClsEx.hIconSm       = LoadIcon(hInstance, IDI_APPLICATION);

    RegisterClassExA(&WndClsEx);

HWND result = CreateWindowExA(
        (DWORD) dwExStyle.Int32Value(), 
        (LPCSTR) std::string("setwindowpos_class").c_str(), 
        (LPCSTR) std::string("test").c_str(), 
        (DWORD) dwStyle.Int32Value(), 
        (int) x.Int32Value(),
        (int) y.Int32Value(),
        (int) width.Int32Value(),
        (int) height.Int32Value(), 
        NULL, 
        NULL, 
        hInstance, 
        NULL
    ); 

/*
    HWND result = CreateWindowExA(
        (DWORD) dwExStyle.Int32Value(), 
        (LPCSTR) std::string("setwindowpos_class").c_str(), 
        (LPCSTR) windowName.Utf8Value().c_str(), 
        (DWORD) dwStyle.Int32Value(), 
        (int) x.Int32Value(),
        (int) y.Int32Value(),
        (int) width.Int32Value(),
        (int) height.Int32Value(), 
        (HWND) hwndParent.Int32Value(), 
        NULL, 
        NULL, 
        NULL
    ); 

    */

    return Napi::Number::New(info.Env(), (long) result);
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "setWindowPos"), Napi::Function::New(env, SetWindowPosition));
    exports.Set(Napi::String::New(env, "getForegroundWindow"), Napi::Function::New(env, GetForegroundWin));
    exports.Set(Napi::String::New(env, "setForegroundWindow"), Napi::Function::New(env, SetForegroundWin));
    exports.Set(Napi::String::New(env, "setWindowLong"), Napi::Function::New(env, SetWinLong));
    exports.Set(Napi::String::New(env, "getWindowLong"), Napi::Function::New(env, GetWinLong));
    exports.Set(Napi::String::New(env, "setWindowRgn"), Napi::Function::New(env, SetWinRgn));
    exports.Set(Napi::String::New(env, "setParentWindow"), Napi::Function::New(env, SetParentWindow));
    exports.Set(Napi::String::New(env, "createWindow"), Napi::Function::New(env, CreateWin));
    exports.Set(Napi::String::New(env, "setBackdrop"), Napi::Function::New(env, SetBackdrop));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)