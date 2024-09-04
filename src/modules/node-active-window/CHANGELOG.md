# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.2.3](https://github.com/paymoapp/node-active-window/compare/v1.2.2...v1.2.3) (2023-05-30)


### Bug Fixes

* **module.linux.demo:** Removed ICU from linking options since it's no longer used ([e71063d](https://github.com/paymoapp/node-active-window/commit/e71063d8e16b7ca1ce1d601207cfad61d9d9def2))
* **module.linux:** Hardcoded icons are not necessarily PNG files, we should handle SVG and XPM as well. XPM is not treated, but SVG can be easily resolved ([b8904ef](https://github.com/paymoapp/node-active-window/commit/b8904efd71f5ad92fa1496c0dc428b42673a0253))

### [1.2.2](https://github.com/paymoapp/node-active-window/compare/v1.2.1...v1.2.2) (2023-04-18)


### Bug Fixes

* **module.macos:** MacOS Catalina doesn't have the screenCaptureAcces CG APIs implemented, so implemented it using a hack ([483d671](https://github.com/paymoapp/node-active-window/commit/483d67136e5bc4c9f6bef75e468ad7c56483bb7a))

### [1.2.1](https://github.com/paymoapp/node-active-window/compare/v1.2.0...v1.2.1) (2023-02-08)


### Bug Fixes

* **module.linux:** Handle the case where XDG_DATA_DIRS or HOME env var is not set ([42d1655](https://github.com/paymoapp/node-active-window/commit/42d165567ec84304ac495e7c798d52085dad2a53))

## [1.2.0](https://github.com/paymoapp/node-active-window/compare/v1.1.1...v1.2.0) (2022-10-17)


### Features

* Use a LRU cache with the size 15 to cache application icons ([851369a](https://github.com/paymoapp/node-active-window/commit/851369af93002c0310fa467d5bc22eb00f1595e3))


### Bug Fixes

* **module.windows:** Fixed crash that occured every once and a while ([7c00ace](https://github.com/paymoapp/node-active-window/commit/7c00ace09295526353a447bc292053023a8ad5ec))


### Improvements

* **module.linux:** Implemented icon cache using an LRU cache and transitioned to unordered_map ([44e74a7](https://github.com/paymoapp/node-active-window/commit/44e74a7c824cb6e156def76a1adbd5e64bf27a5d))
* **module.macos:** Implemented icon cache using an LRU cache ([dc41b34](https://github.com/paymoapp/node-active-window/commit/dc41b349c767e59f6818ff3e56b11f9b83f3f966))
* **module.windows:** Implemented icon cache using an LRU cache and transitioned to unordered_map ([8e0683e](https://github.com/paymoapp/node-active-window/commit/8e0683ec07a28a3a2235708cdc29de0c1a4525c9))


### Documentation

* Added documentation for icon cache and benchmark mode ([50f544d](https://github.com/paymoapp/node-active-window/commit/50f544da2c8f164870f254cab9d25caceef6b1e8))

### [1.1.1](https://github.com/paymoapp/node-active-window/compare/v1.1.0...v1.1.1) (2022-10-13)


### Bug Fixes

* **lib:** Disable artificial runloop on osX by default ([edb6a82](https://github.com/paymoapp/node-active-window/commit/edb6a821874781832f3a00f4faffa781f87e84c9))

## [1.1.0](https://github.com/paymoapp/node-active-window/compare/v1.0.16...v1.1.0) (2022-10-11)


### Features

* **module.linux:** Fallback to _NET_WM_ICON if can not find desktop icon ([fa12dd9](https://github.com/paymoapp/node-active-window/commit/fa12dd92657a0a91ba1723a4e5dec959c5fff570))


### Bug Fixes

* **module.windows:** Fixed crash when SHCreateMemStream couldn't allocate a stream for getting the icon ([0248451](https://github.com/paymoapp/node-active-window/commit/02484517a830056ff0484bf8c452016e7c7f832c))


### Refactor

* **module.linux:** Using git submodules for library dependencies ([c52b587](https://github.com/paymoapp/node-active-window/commit/c52b5875a2e75dfaa37f3adde9c1a48ba8e7515f))
* **module.macos:** Using git submodules for library dependencies ([e397ca9](https://github.com/paymoapp/node-active-window/commit/e397ca9e5a6b529df6182d86086e79d1ffbef2f3))
* **module.windows:** Using git submodules for library dependencies ([981b119](https://github.com/paymoapp/node-active-window/commit/981b1196da02c1d4f4ce0e097bcf1b82830cf052))


### Build/CI

* **gitlab:** Clone submodules when building ([033c177](https://github.com/paymoapp/node-active-window/commit/033c17702f81be8262918f0a596a8b3ab75f922b))

### [1.0.16](https://github.com/paymoapp/node-active-window/compare/v1.0.15...v1.0.16) (2022-10-05)


### Bug Fixes

* **module.windows:** Fixed possible null pointer references ([cd07d45](https://github.com/paymoapp/node-active-window/commit/cd07d45654b316eb853e8e7020694d4e09f7429f))

### [1.0.15](https://github.com/paymoapp/node-active-window/compare/v1.0.14...v1.0.15) (2022-09-21)


### Bug Fixes

* **module.macos:** Fixed memory leak ([80214c8](https://github.com/paymoapp/node-active-window/commit/80214c8e753e021fd06576673d262fcc65d67b25))

### [1.0.14](https://github.com/paymoapp/node-active-window/compare/v1.0.13...v1.0.14) (2022-09-19)


### Bug Fixes

* **module.linux:** Removed debug value ([e83e85e](https://github.com/paymoapp/node-active-window/commit/e83e85e3d5630b206fa3b7ee0619cef5c1086674))

### [1.0.13](https://github.com/paymoapp/node-active-window/compare/v1.0.12...v1.0.13) (2022-09-15)


### Bug Fixes

* **module.linux:** Added XErrorHandler to avoid crashes on XErrors ([21f0a6e](https://github.com/paymoapp/node-active-window/commit/21f0a6e270d4d0380c4139aea7b34bd6bc4e7fff))

### [1.0.12](https://github.com/paymoapp/node-active-window/compare/v1.0.11...v1.0.12) (2022-09-06)


### Build/CI

* Automatic release changelog generation on GitHub ([dc42c44](https://github.com/paymoapp/node-active-window/commit/dc42c44e50cda4f92084e8a306171f4bd8d0aa47))

### [1.0.11](https://github.com/paymoapp/node-active-window/compare/v1.0.10...v1.0.11) (2022-09-06)


### Build/CI

* Migrate to prebuild ([177e9af](https://github.com/paymoapp/node-active-window/commit/177e9af993422d345ade22efb606772ccfe6f427))

### [1.0.10](https://github.com/paymoapp/node-active-window/compare/v1.0.9...v1.0.10) (2022-08-16)


### Build/CI

* Fix mac build architecture ([9b69c97](https://github.com/paymoapp/node-active-window/commit/9b69c973136d4ead82f0e63d9c1f32dd763f04af))

### [1.0.9](https://github.com/paymoapp/node-active-window/compare/v1.0.8...v1.0.9) (2022-07-18)


### Documentation

* Fixed namespace in README ([efb4692](https://github.com/paymoapp/node-active-window/commit/efb4692ff5ce0ad0e1116a649c373cb7a586c33a))

### [1.0.8](https://github.com/paymoapp/node-active-window/compare/v1.0.7...v1.0.8) (2022-06-29)

### [1.0.7](https://gitlab.paymoapp.com/paymo/node-active-window/compare/v1.0.6...v1.0.7) (2022-06-29)


### Build/CI

* Publish package to NPM registry ([642261c](https://gitlab.paymoapp.com/paymo/node-active-window/commit/642261cdee3057569c1200267c00660808aa98c0))

### [1.0.6](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v1.0.5...v1.0.6) (2022-06-29)


### Bug Fixes

* Relative path of main in package.json ([dab02a5](https://gitlab.paymoapp.com/gergo/node-active-window/commit/dab02a575ba9ea5ed083c3e82c0c55ddc5d226ae))

### [1.0.5](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v1.0.4...v1.0.5) (2022-06-29)


### Bug Fixes

* Try to make NPM run the install script ([6cf26b7](https://gitlab.paymoapp.com/gergo/node-active-window/commit/6cf26b73328fa015a1eb899f6429f08f2dde05fa))

### [1.0.4](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v1.0.3...v1.0.4) (2022-06-28)

### [1.0.3](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v1.0.2...v1.0.3) (2022-06-28)


### Bug Fixes

* Include binding.gyp file and addon source code in the package ([963ddad](https://gitlab.paymoapp.com/gergo/node-active-window/commit/963ddad06c5a67f619e023fdd8cc8db287f466cd))

### [1.0.2](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v1.0.1...v1.0.2) (2022-06-28)


### Bug Fixes

* Use postinstall script to download addon when installed as a dependency ([03f2ee3](https://gitlab.paymoapp.com/gergo/node-active-window/commit/03f2ee3a4bdae60f23796737a852dfcb8eaa08a9))

### [1.0.1](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v1.0.0...v1.0.1) (2022-06-28)


### Build/CI

* **gitlab:** Fixed changelog escaping ([eba272b](https://gitlab.paymoapp.com/gergo/node-active-window/commit/eba272b5cef8d22a9606485d71e4ddd0bb97fbff))

## [1.0.0](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-12...v1.0.0) (2022-06-28)


### Build/CI

* **gitlab:** Remove tag name from release description ([0bbb098](https://gitlab.paymoapp.com/gergo/node-active-window/commit/0bbb098f27b18bf4c5ed1ccf8c86cbd4c7797b01))

### [0.1.1-12](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-11...v0.1.1-12) (2022-06-28)

### [0.1.1-11](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-10...v0.1.1-11) (2022-06-28)


### Build/CI

* **gitlab:** Create gitlab releases only with bash ([4170015](https://gitlab.paymoapp.com/gergo/node-active-window/commit/41700158033429dab44fcd273bfa681e08396adf))

### [0.1.1-10](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-9...v0.1.1-10) (2022-06-28)


### Build/CI

* **gitlab:** Create gitlab release after each tag ([9cb8bea](https://gitlab.paymoapp.com/gergo/node-active-window/commit/9cb8bea065bfc8fef723926a19ffc2ec402a8601))

### [0.1.1-9](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-8...v0.1.1-9) (2022-06-28)

### [0.1.1-8](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-7...v0.1.1-8) (2022-06-28)


### Build/CI

* **gitlab:** Publish to gitlab registry ([ee551bc](https://gitlab.paymoapp.com/gergo/node-active-window/commit/ee551bc33b5d18a29be7ae53443d5901edc15bda))

### [0.1.1-7](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-6...v0.1.1-7) (2022-06-24)

### [0.1.1-6](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-5...v0.1.1-6) (2022-06-24)


### Build/CI

* Using img-ubuntu-widget-build for building the linux addon ([e0857f8](https://gitlab.paymoapp.com/gergo/node-active-window/commit/e0857f8617217d646ee0fc614a63f4e8e7aee9f0))

### [0.1.1-5](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-4...v0.1.1-5) (2022-06-23)

### [0.1.1-4](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-3...v0.1.1-4) (2022-06-23)


### Build/CI

* **gitlab:** Use --target_arch at publish time ([d3d2ec2](https://gitlab.paymoapp.com/gergo/node-active-window/commit/d3d2ec2a71722b2ae5ad0291f2a2fb2af1105f05))

### [0.1.1-3](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-2...v0.1.1-3) (2022-06-23)


### Build/CI

* **gitlab:** M1 has arm64 arch not arm ([67475d7](https://gitlab.paymoapp.com/gergo/node-active-window/commit/67475d7ff7f2d48bd0aca18baca38d0e071dae54))

### [0.1.1-2](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-1...v0.1.1-2) (2022-06-23)


### Build/CI

* Fixing mac build ([00dc5ca](https://gitlab.paymoapp.com/gergo/node-active-window/commit/00dc5cac83ecafb89c2012836de699b27dfd3a2c))

### [0.1.1-1](https://gitlab.paymoapp.com/gergo/node-active-window/compare/v0.1.1-0...v0.1.1-1) (2022-06-23)

### 0.1.1-0 (2022-06-22)


### Features

* Added javascript-side demo ([7503dce](https://gitlab.paymoapp.com/gergo/node-active-window/commit/7503dce9ed655d8d0535c0a834fc161e874fdef4))
* Enabled prebuilt binding files using node-pre-gyp ([a8de768](https://gitlab.paymoapp.com/gergo/node-active-window/commit/a8de768868ef9e34a3a75f983c1f7ea9f92b5c43))
* **module.linux:** Added bindings for subscribe and unsubscribe, modified demo and javascript library to support subscriptions ([d26fbc9](https://gitlab.paymoapp.com/gergo/node-active-window/commit/d26fbc96a00d7c911ea644a4d5bb2eb922e18f71))
* **module.linux:** Added napi mappings for linux library, added initialize function ([9018519](https://gitlab.paymoapp.com/gergo/node-active-window/commit/901851901a32269cb8586886ccb39f138051a823))
* **module.linux:** Added watch mode with background thread and callbacks ([56f4276](https://gitlab.paymoapp.com/gergo/node-active-window/commit/56f42765db4a25b6fa80db7645668d8f4026c6ee))
* **module.linux:** Get active window and active window title using xlib ([2c76920](https://gitlab.paymoapp.com/gergo/node-active-window/commit/2c7692040ac59ca60504a8f75fd2db8b88aa290c))
* **module.linux:** Get application icon using app cache built during startup ([26bc9fe](https://gitlab.paymoapp.com/gergo/node-active-window/commit/26bc9feb4ed37ad7d888a6be0eb7adcae9a6aa40))
* **module.linux:** Get title, pid and application name - in this case, class - of active window ([3c86011](https://gitlab.paymoapp.com/gergo/node-active-window/commit/3c860119e2e246b038fd92764c769ebfc5d745d7))
* **module.linux:** Loading all application desktop entries and resolving the icon paths for them ([a60feff](https://gitlab.paymoapp.com/gergo/node-active-window/commit/a60feffec25ceb7a4789db5339cedfc7773258e3))
* **module.macos:** Added napi mappings for macos library ([82b18fe](https://gitlab.paymoapp.com/gergo/node-active-window/commit/82b18fe0114a4b01fafc0729f189489f674c61c6))
* **module.macos:** Added watch mode with hacky runloop ([1fcba28](https://gitlab.paymoapp.com/gergo/node-active-window/commit/1fcba2896f3022bda6f7a07536f6c7f8b5788d53))
* **module.macos:** Implemented bindings and added javascript code that continuously calls the NSRunLoop when it detects darwin ([9d49792](https://gitlab.paymoapp.com/gergo/node-active-window/commit/9d49792f0abbe86904f327b78dbdbb7cb6821881))
* **module.macos:** Implemented macos library to get active window info ([635043b](https://gitlab.paymoapp.com/gergo/node-active-window/commit/635043b1fdd48e4b501ab034ee6793cc10e22bbd))
* **module.windows:** Added bindings for subscription ([658c277](https://gitlab.paymoapp.com/gergo/node-active-window/commit/658c277cf3fef493f9e52633f06a1a55d2647c32))
* **module.windows:** Added napi binding ([4796d5f](https://gitlab.paymoapp.com/gergo/node-active-window/commit/4796d5f4e6e107f51ad59f2f7a13a6d344b625b3))
* **module.windows:** Added watch mode with background thread ([8fceff0](https://gitlab.paymoapp.com/gergo/node-active-window/commit/8fceff0566c800d34f5fd3e6149452fbcfa157cc))
* **module.windows:** Extract application icon from exe and convert it to base64 encoded png data url ([30f8715](https://gitlab.paymoapp.com/gergo/node-active-window/commit/30f8715f5cd7606aa68071e871d4153a875cebe8))
* **module.windows:** Extract application icon from executable and save it in a file for now *WIP* ([2c14d1b](https://gitlab.paymoapp.com/gergo/node-active-window/commit/2c14d1bb7d909d40cdaaa93b0ed21cf30c2da6b2))
* **module.windows:** Extract application icon from UWP apps ([febb0e3](https://gitlab.paymoapp.com/gergo/node-active-window/commit/febb0e34bfecea1b79d6eca936a72f2a402838cf))
* **module.windows:** Get application name and path for UWP apps ([395fae3](https://gitlab.paymoapp.com/gergo/node-active-window/commit/395fae325b535aed4b4d6b6d7a6657bd1281b4ff))
* **module.windows:** Get window in foreground and it's title, application name, application path and PID ([5e84d0c](https://gitlab.paymoapp.com/gergo/node-active-window/commit/5e84d0c152f5981481370cfab56057dce8838156))
* Updated javascript code to support requesting permissions ([634759a](https://gitlab.paymoapp.com/gergo/node-active-window/commit/634759a1c56968311188bea34b7d6e6b2462b041))


### Bug Fixes

* **demo:** Added request permissions call ([2bca603](https://gitlab.paymoapp.com/gergo/node-active-window/commit/2bca6037abc2a88a245db33a555d8157c47063bf))
* **library:** The callback for addon.subscribe can get null and the value needs to be encoded ([1d2d9b6](https://gitlab.paymoapp.com/gergo/node-active-window/commit/1d2d9b6831b2fbf73e2111ce74d8bda6ba19d352))
* **module.macos:** Check if we have macOS catalina to check screen capture permissions ([3a36423](https://gitlab.paymoapp.com/gergo/node-active-window/commit/3a36423140a3b8cefd4d4c5583def1ba8c477b9f))
* **module.macos:** Implemented RunLoop to update frontmost window ([e2a93f7](https://gitlab.paymoapp.com/gergo/node-active-window/commit/e2a93f77fda78a0ac9bf3494dc99a6a02392160d))
* **module.windows:** Also watch for title changed events ([c3864a1](https://gitlab.paymoapp.com/gergo/node-active-window/commit/c3864a1f34d4bd1fa522c67099cda1c80a8dbb0e))
* **module.windows:** Clean up after itself ([f3c8618](https://gitlab.paymoapp.com/gergo/node-active-window/commit/f3c86188a79bf9d5b688e0f179be93e55737f47c))
* **module.windows:** Close process handle ([31881ca](https://gitlab.paymoapp.com/gergo/node-active-window/commit/31881cac636a8a791c0523fa40ce4f13f7212f6a))
* **module.windows:** Don't crash when UWP app is not yet initialized ([c0911e8](https://gitlab.paymoapp.com/gergo/node-active-window/commit/c0911e8ccb788ddcf657304d0bd898e2d3ecb60b))
* **module.windows:** Fixed buffer overflow in getWindowTitle and replaced &buf[0] to buf.data() to access raw array of vectors ([bd70a97](https://gitlab.paymoapp.com/gergo/node-active-window/commit/bd70a9722c8c508419f53e9331f63cfaf7294dce))


### Documentation

* Added documentation for JS library ([8dd91dc](https://gitlab.paymoapp.com/gergo/node-active-window/commit/8dd91dc19370ebe1a5b3fd39a9df3a94387a217a))
* Added documentation for windows and macos native modules ([5fd30ce](https://gitlab.paymoapp.com/gergo/node-active-window/commit/5fd30ce6bd9c20f7b036ac2c834f82dcf6c5ede5))
* **module.linux:** Added documentation for linux native library ([e18a015](https://gitlab.paymoapp.com/gergo/node-active-window/commit/e18a015b8530043375ca6f8d0e71c6aa45f9a8ce))


### Build/CI

* **docs:** Added script to automatically generate README table of contents ([9d4878b](https://gitlab.paymoapp.com/gergo/node-active-window/commit/9d4878b2c7132f18c9893f3ec8a05b621c1d72e8))
* **gitlab:** Added gitlab-ci configuration ([4c50352](https://gitlab.paymoapp.com/gergo/node-active-window/commit/4c5035292971b9f8f7f495aad9ac627f8e4132f4))
* **gitlab:** Fix typo ([ff78131](https://gitlab.paymoapp.com/gergo/node-active-window/commit/ff78131ca80f9d011aa4f851617069c099367f05))
* Include N-API version in prebuilt binaries ([0b2ce15](https://gitlab.paymoapp.com/gergo/node-active-window/commit/0b2ce155e24d11aea0a5a18e3bf92b6d08c340ce))
* Initialized project ([d2f19a2](https://gitlab.paymoapp.com/gergo/node-active-window/commit/d2f19a25ae1be025762a82718e8157aafcf22c0c))
* **module.windows:** Use visual studio nmake to build demo instead of mingw ([e33fdb9](https://gitlab.paymoapp.com/gergo/node-active-window/commit/e33fdb900eef68abe9d116ff18e38d29998f574d))
