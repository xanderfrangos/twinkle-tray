{
    "variables": {
        "openssl_fips" : "0" 
    },
    "targets": [
        {
            "target_name": "win32_displayconfig",
            "cflags!": ["-fno-exceptions"],
            "cflags_cc!": ["-fno-exceptions"],
            "conditions": [
                ["OS=='win'", {
                    "sources": ["win32-displayconfig.cc"]
                }],
            ],
            "include_dirs": [
                "<!@(node -p \"require('node-addon-api').include\")"
            ],
            'msvs_settings': {
                'VCCLCompilerTool': { "ExceptionHandling": 1, 'AdditionalOptions': [ '/permissive' ] }
            },
            'defines': ['NAPI_DISABLE_CPP_EXCEPTIONS'],
        }
    ]
}
