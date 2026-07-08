#define WIN32_LEAN_AND_MEAN
#include <napi.h>
#include <windows.h>
#include <sensorsapi.h>
#include <sensors.h>
#include <wchar.h>
#include <string>
#include <vector>
#include "utils.hpp"

#pragma comment(lib, "sensorsapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "propsys.lib")

std::vector<SensorInfo> GetAllLightSensors() {
    ComInit com;

    const auto sensors = GetSensors();

    std::vector<SensorInfo> sensorInfos;
    sensorInfos.reserve(sensors.size());
    for (const auto &sensor : sensors) {
        sensorInfos.emplace_back(sensor);
    }
    return sensorInfos;
}

double GetLuxValueById(const std::string& id) {
    ComInit com;

    const auto sensors = GetSensors();

    for (const auto &sensor : sensors) {
        SENSOR_ID sensorId;
        if (SUCCEEDED(sensor->GetID(&sensorId))) {
            if (GuidToString(sensorId) == id) {
                return SensorInfo(sensor).currentLux;
            }
        }
    }
    return -1;
}

// Node.js wrapper for getAmbientLightSensors
Napi::Array NodeGetAmbientLightSensors(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Array result = Napi::Array::New(env);

    try {
        std::vector<SensorInfo> sensors = GetAllLightSensors();
        
        for (size_t i = 0; i < sensors.size(); i++) {
            Napi::Object sensorObj = Napi::Object::New(env);
            sensorObj.Set("id", Napi::String::New(env, sensors[i].id));
            sensorObj.Set("name", Napi::String::New(env, sensors[i].name));
            sensorObj.Set("state", Napi::String::New(env, sensors[i].state));

            if (sensors[i].currentLux >= 0.0) {
                sensorObj.Set("currentLux", Napi::Number::New(env, sensors[i].currentLux));
            } else {
                sensorObj.Set("currentLux", env.Null());
            }

            result.Set((uint32_t)i, sensorObj);
        }
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    } catch (...) {
        Napi::Error::New(env, "Unknown error occurred").ThrowAsJavaScriptException();
    }

    return result;
}

// Node.js wrapper for getLuxValue
Napi::Value NodeGetLuxValue(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    try {
        std::string sensorId;
        bool hasId = false;

        // Check if sensor ID was provided
        if (info.Length() > 0 && info[0].IsString()) {
            sensorId = info[0].As<Napi::String>().Utf8Value();
            hasId = true;
        }

        double luxValue = -1.0;

        if (hasId) {
            // Get lux from specific sensor
            luxValue = GetLuxValueById(sensorId);
        } else {
            // Get lux from first available sensor
            std::vector<SensorInfo> sensors = GetAllLightSensors();

            if (!sensors.empty()) {
                luxValue = sensors[0].currentLux;
                
                // If first sensor didn't have data, try getting it fresh
                if (luxValue < 0.0) {
                    luxValue = GetLuxValueById(sensors[0].id);
                }
            }
        }

        if (luxValue >= 0.0) {
            return Napi::Number::New(env, luxValue);
        } else {
            return env.Null();
        }
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    } catch (...) {
        Napi::Error::New(env, "Unknown error occurred").ThrowAsJavaScriptException();
        return env.Null();
    }
}

// Initialize the module
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "getAmbientLightSensors"), 
                Napi::Function::New(env, NodeGetAmbientLightSensors));
    exports.Set(Napi::String::New(env, "getLuxValue"), 
                Napi::Function::New(env, NodeGetLuxValue));
    return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
