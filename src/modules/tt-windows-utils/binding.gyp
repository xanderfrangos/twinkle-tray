{
  "targets": [
    {
      "target_name": "windows_window_utils",
      "cflags!": [ ],
      "cflags_cc!": [ ],
      "sources": [ "windows_window_utils.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'msvs_settings': {
        'VCCLCompilerTool': { "ExceptionHandling": 1, 'AdditionalOptions': [ '-std:c++17' ] }
      },
      'defines': [ 'NAPI_CPP_EXCEPTIONS' ],
    },
    {
      "target_name": "windows_power_events",
      "cflags!": [ ],
      "cflags_cc!": [ ],
      "sources": [ "windows_power_events.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'msvs_settings': {
        'VCCLCompilerTool': { "ExceptionHandling": 1, 'AdditionalOptions': [ '-std:c++17' ] }
      },
      'defines': [ 'NAPI_CPP_EXCEPTIONS' ],
    },
    {
      "target_name": "windows_window_material",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ "windows_window_material.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
    },
    {
      "target_name": "windows_media_status",
      "cflags!": [ ],
      "cflags_cc!": [ ],
      "cflags_cc": [ "-std=c++17" ],
      "conditions": [
        ["OS=='win'", {
      	  "sources": [ "windows_media_status.cc" ]
      	}],
      ],
      'msvs_settings': {
        'VCCLCompilerTool': { "ExceptionHandling": 1, 'AdditionalOptions': [ '-std:c++17' ] }
      },
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': [ 'NAPI_CPP_EXCEPTIONS' ],
    },
    {
      "target_name": "windows_app_startup",
      "cflags!": [ ],
      "cflags_cc!": [ ],
      "cflags_cc": [ "-std=c++17" ],
      "conditions": [
        ["OS=='win'", {
      	  "sources": [ "windows_app_startup.cc" ]
      	}],
      ],
      'msvs_settings': {
        'VCCLCompilerTool': { "ExceptionHandling": 1, 'AdditionalOptions': [ '-std:c++17' ] }
      },
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': [ 'NAPI_CPP_EXCEPTIONS' ],
    }
  ]
}