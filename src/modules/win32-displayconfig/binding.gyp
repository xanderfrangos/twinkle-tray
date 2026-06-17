{
    "variables": {
        "openssl_fips" : "0" 
    },
    "targets": [
        {
            "target_name": "win32_displayconfig",
            "cflags!": ["-fno-exceptions"],
            "cflags_cc!": ["-fno-exceptions"],
            "cflags_cc": [ "-std=c++20" ],
            "conditions": [
                ["OS=='win'", {
                    "sources": ["win32-displayconfig.cc"]
                }],
            ],
            "include_dirs": [
                "<!@(node -p \"require('node-addon-api').include\")"
            ],
            'msvs_settings': {
                'VCCLCompilerTool': { "ExceptionHandling": 1, 'AdditionalOptions': [ '/permissive', '-std:c++20' ] }
            },
            'defines': ['NAPI_DISABLE_CPP_EXCEPTIONS'],
        }
    ]
}
