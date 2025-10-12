{
	"targets": [
		{
			"target_name": "PaymoActiveWindow",
			"conditions": [
				["OS=='win'", {
					"sources": [
						"module/windows/napi/main.cpp",
						"module/windows/napi/module.cpp",
						"module/windows/src/ActiveWindow.cpp"
					],
					"libraries": [
						"User32.lib",
						"Shell32.lib",
						"Version.lib",
						"Shlwapi.lib",
						"Windowsapp.lib"
					],
					"msvs_settings": {
						"VCCLCompilerTool": {
							"AdditionalOptions": [
								"/std:c++17"
							]
						}
					},
					"msvs_configuration_platform": "x64",
					"msvs_configuration_attributes": {
						"PlatformToolset": "v143"
					}
				}]
			],
			"include_dirs": [
				"<!@(node -p \"require('node-addon-api').include\")"
			],
			"libraries": [],
			"dependencies": [
				"<!(node -p \"require('node-addon-api').gyp\")"
			],
			"defines": [
				"NAPI_DISABLE_CPP_EXCEPTIONS",
				"NAPI_VERSION=<(napi_build_version)"
			]
		}
	]
}
