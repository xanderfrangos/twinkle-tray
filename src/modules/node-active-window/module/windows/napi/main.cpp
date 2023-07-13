#include <napi.h>
#include "module.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
	return module::Init(env, exports);
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, InitAll);
