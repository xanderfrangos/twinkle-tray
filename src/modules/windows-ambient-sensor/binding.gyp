{
  "targets": [
    {
      "target_name": "windows_ambient_sensor",
      "cflags!": [ ],
      "cflags_cc!": [ ],
      "sources": [ "windows_ambient_sensor.cc", "utils.hpp" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'msvs_settings': {
        'VCCLCompilerTool': { "ExceptionHandling": 1, 'AdditionalOptions': [ '-std:c++17' ] }
      },
      'defines': [ 'NAPI_CPP_EXCEPTIONS' ],
      'libraries': [
        'sensorsapi.lib',
        'ole32.lib',
        'propsys.lib'
      ]
    },
  ]
}
