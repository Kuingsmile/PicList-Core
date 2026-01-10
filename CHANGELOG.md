##  (2026-01-10)

* :bug: Fix(custom): specific sharp to 0.34.4 dee8fac



##  (2026-01-10)

* :package: Chore(custom): downgrade sharp ace6ee0



##  (2026-01-10)

* :sparkles: Feature(custom): support picbed specific compress/watermark/rename/autorename/manualrenam 74e8a6f



##  (2026-01-09)

* :arrow_up: Upgrade(custom): upgrade to piclist/store 3.0.1 c4aecc8
* :pencil: Docs(custom): update readme 587d588
* :sparkles: Feature(custom): db now support multiple config get 47314cc
* :sparkles: Feature(custom): support multiple uploader config with the same config in PicList desktop 1f145ed



##  (2026-01-06)

* :arrow_up: Upgrade(custom): upgrade deps 95477a4
* :arrow_up: Upgrade(custom): upgrade deps 58be712
* :bug: Fix(custom): fix an issue where eslint not worked as expected 364ce95
* :package: Chore(custom): enable conditional push to Docker Hub based on workflow input 0212769
* :package: Chore(custom): update gitignore file fcb0674
* :pencil: Docs(custom): update docs b971986
* Add renovate.json (#22) 484bc1a, closes #22
* Update dependency @smithy/node-http-handler to v4.4.7 (#23) eb0e239, closes #23



##  (2025-11-14)

* :arrow_up: Upgrade(custom): upgrade deps dcb971f
* :arrow_up: Upgrade(custom): upgrade deps e25e7c7
* :arrow_up: Upgrade(custom): upgrade deps e0358be
* :arrow_up: Upgrade(custom): upgrade deps ebc991a
* :bug: Fix(custom): fix wayland image upload bug 41a9b96, closes #19
* :package: Chore(custom): update tseslint usage a0dc819
* :sparkles: Feature(custom): add webpath for github c7eb33c
* :sparkles: Feature(custom): optimize cli script 1e2792c



##  (2025-09-25)

* :arrow_up: Upgrade(custom): upgrade deps 7b29f04
* :sparkles: Feature(custom): add sha256 placeholder for rename 2712866



##  (2025-08-21)

* :pencil: Docs(custom): update readme be7edd1
* :sparkles: Feature(custom): support set image process setting for per picbed a98185b
* :zap: Perf(custom): optimize random string generation algorithm c386b48



##  (2025-08-20)

* :bug: Fix(custom): replace mime-type with mime 18e6b75



##  (2025-08-12)

* :arrow_up: Upgrade(custom): upgrade deps 75e5a11
* :package: Chore(custom): remove unused files 6be4d68
* :sparkles: Feature(custom): add image watermark opacity setting a1d41f5
* :sparkles: Feature(custom): add options for s3 88e2c7f, closes Kuingsmile/Piclist#343
* :sparkles: Feature(custom): change  watermark and image compress order bc380a6
* :sparkles: Feature(custom): migrate to esm 838cb84
* :sparkles: Feature(custom): optimize server 0dc69b2
* :sparkles: Feature(custom): remove cjs support 9cd9674



## :tada: 1.9.14 (2025-06-12)


### :back: Revert

* **custom:** revert sharp upgrade ([bb558cd](https://github.com/Kuingsmile/PicList-Core/commit/bb558cd))



## :tada: 1.9.13 (2025-06-10)


### :sparkles: Features

* **custom:** add skip process setting ([81da5b1](https://github.com/Kuingsmile/PicList-Core/commit/81da5b1))
* **custom:** add webPath support for aliyun ([a81fea6](https://github.com/Kuingsmile/PicList-Core/commit/a81fea6))
* **custom:** add webPath support for tcyun ([1000c8b](https://github.com/Kuingsmile/PicList-Core/commit/1000c8b))
* **custom:** add webPath support to custom api ([7e83d0e](https://github.com/Kuingsmile/PicList-Core/commit/7e83d0e))


### :bug: Bug Fixes

* **custom:** fix an issue where upload will filed caused by backup domain setting ([0a6fdf8](https://github.com/Kuingsmile/PicList-Core/commit/0a6fdf8))
* **custom:** fix webdav webpath default value bug ([0184100](https://github.com/Kuingsmile/PicList-Core/commit/0184100))


### :package: Chore

* **custom:** add mcp server configuration ([03cdfe9](https://github.com/Kuingsmile/PicList-Core/commit/03cdfe9))



## :tada: 1.9.12 (2025-06-03)


### :sparkles: Features

* **custom:** add error handling for missing SM.MS token in uploader plugin ([b229807](https://github.com/Kuingsmile/PicList-Core/commit/b229807))
* **custom:** improve image upload handling and error notifications in uploader plugin ([50e8dc8](https://github.com/Kuingsmile/PicList-Core/commit/50e8dc8))


### :bug: Bug Fixes

* **custom:** fix typo ([a3dc79b](https://github.com/Kuingsmile/PicList-Core/commit/a3dc79b))


### :package: Chore

* **custom:** remove unused files ([0a6827f](https://github.com/Kuingsmile/PicList-Core/commit/0a6827f))


### :pencil: Documentation

* **custom:** add DeepWiki reference to English and Chinese README files ([50c4b09](https://github.com/Kuingsmile/PicList-Core/commit/50c4b09))
* **custom:** update readme ([abc7986](https://github.com/Kuingsmile/PicList-Core/commit/abc7986))



## :tada: 1.9.11 (2025-02-27)


### :sparkles: Features

* **custom:** optimize getconfig to hot-reload ([da65a05](https://github.com/Kuingsmile/PicList-Core/commit/da65a05))


### :bug: Bug Fixes

* **custom:** fix alist output url bug ([3270f67](https://github.com/Kuingsmile/PicList-Core/commit/3270f67))


### :pencil: Documentation

* **custom:** add chinease readme.md ([08386c3](https://github.com/Kuingsmile/PicList-Core/commit/08386c3))



## :tada: 1.9.10 (2024-12-27)


### :bug: Bug Fixes

* **custom:** fix custom prefix bug of advanced picbed ([4a58a89](https://github.com/Kuingsmile/PicList-Core/commit/4a58a89))



## :tada: 1.9.9 (2024-12-19)


### :bug: Bug Fixes

* **custom:** fix webdav rename bug ([7d4b9e8](https://github.com/Kuingsmile/PicList-Core/commit/7d4b9e8))



## :tada: 1.9.8 (2024-11-25)


### :sparkles: Features

* **custom:** add milliseconds ([86671c2](https://github.com/Kuingsmile/PicList-Core/commit/86671c2))



## :tada: 1.9.7 (2024-11-16)


### :bug: Bug Fixes

* **custom:** fix file convert bug of HEIC file ([9362aad](https://github.com/Kuingsmile/PicList-Core/commit/9362aad))
* **custom:** quality must be 1-100 ([abad489](https://github.com/Kuingsmile/PicList-Core/commit/abad489))



## :tada: 1.9.6 (2024-09-12)


### :sparkles: Features

* **custom:** remove telegra.ph ([cb2e076](https://github.com/Kuingsmile/PicList-Core/commit/cb2e076))



## :tada: 1.9.5 (2024-09-11)


### :sparkles: Features

* **custom:** optimize second uploader ([58ae7ea](https://github.com/Kuingsmile/PicList-Core/commit/58ae7ea))



## :tada: 1.9.4 (2024-09-03)


### :bug: Bug Fixes

* **custom:** fix webdav url bug ([38bc174](https://github.com/Kuingsmile/PicList-Core/commit/38bc174))



## :tada: 1.9.3 (2024-08-20)


### :sparkles: Features

* **custom:** support picgo-server for piclist picbed ([3e91a9c](https://github.com/Kuingsmile/PicList-Core/commit/3e91a9c))



## :tada: 1.9.2 (2024-08-12)


### :sparkles: Features

* **custom:** optimize windows clipboard script ([52b4612](https://github.com/Kuingsmile/PicList-Core/commit/52b4612))



## :tada: 1.9.1 (2024-07-25)


### :sparkles: Features

* **custom:** add advanced picbed ([3c4c806](https://github.com/Kuingsmile/PicList-Core/commit/3c4c806))


### :package: Chore

* **custom:** remove eol in prettierrc ([6332a9b](https://github.com/Kuingsmile/PicList-Core/commit/6332a9b))


### :pencil: Documentation

* **custom:** update docs ([696a054](https://github.com/Kuingsmile/PicList-Core/commit/696a054))



# :tada: 1.9.0 (2024-07-05)


### :sparkles: Features

* **custom:** add buildin alist ([c7f5659](https://github.com/Kuingsmile/PicList-Core/commit/c7f5659))
* **custom:** optimize commander ([9e42652](https://github.com/Kuingsmile/PicList-Core/commit/9e42652))



## :tada: 1.8.12 (2024-06-27)


### :sparkles: Features

* **custom:** optimize upload progress event ([048b338](https://github.com/Kuingsmile/PicList-Core/commit/048b338))



## :tada: 1.8.11 (2024-06-24)


### :sparkles: Features

* **custom:** picgo-server now support configName ([95f9b18](https://github.com/Kuingsmile/PicList-Core/commit/95f9b18))


### :bug: Bug Fixes

* **custom:** remove unused code ([ef137fe](https://github.com/Kuingsmile/PicList-Core/commit/ef137fe))



## :tada: 1.8.10 (2024-06-14)



## :tada: 1.8.9 (2024-06-13)


### :sparkles: Features

* **custom:** refresh before getconfig ([387abe7](https://github.com/Kuingsmile/PicList-Core/commit/387abe7))
* **custom:** support delete for repeat image when using sm.ms ([6b512ad](https://github.com/Kuingsmile/PicList-Core/commit/6b512ad))


### :bug: Bug Fixes

* **custom:** fix url upload bug ([fb510de](https://github.com/Kuingsmile/PicList-Core/commit/fb510de))



## :tada: 0.5.3 (2023-04-29)


### :sparkles: Features

* add auth user upload for imgur ([ebfe657](https://github.com/Kuingsmile/PicList-Core/commit/ebfe657))


### :bug: Bug Fixes

* compatibility with auto-delete ([f9248d5](https://github.com/Kuingsmile/PicList-Core/commit/f9248d5))


### :pencil: Documentation

* update docs ([2ffac40](https://github.com/Kuingsmile/PicList-Core/commit/2ffac40))



## :tada: 0.5.2 (2023-04-18)


### :sparkles: Features

* add auth user upload for imgur ([ebfe657](https://github.com/Kuingsmile/PicList-Core/commit/ebfe657))


### :bug: Bug Fixes

* compatibility with auto-delete ([f9248d5](https://github.com/Kuingsmile/PicList-Core/commit/f9248d5))


### :pencil: Documentation

* update docs ([2ffac40](https://github.com/Kuingsmile/PicList-Core/commit/2ffac40))



## :tada: 0.5.1 (2023-04-15)


### :sparkles: Features

* add auth user upload for imgur ([ebfe657](https://github.com/Kuingsmile/PicList-Core/commit/ebfe657))



# :tada: 0.3.0 (2023-03-09)


### :sparkles: Features

* reduce package size ([c59c1dc](https://github.com/Kuingsmile/PicList-Core/commit/c59c1dc))




# :tada: PicList core 0.0.6 (2023-01-23)

### :sparkles: Features

* github、smms and imgur uploader now returns hash for deleting uploaded file.

# :tada: 1.5.0-alpha.17 (2022-11-13)


### :sparkles: Features

* update picgo.use ([e19bb6e](https://github.com/PicGo/PicGo-Core/commit/e19bb6e))


### :bug: Bug Fixes

* some case will cause proxy not work ([6272303](https://github.com/PicGo/PicGo-Core/commit/6272303))



# :tada: 1.5.0-alpha.16 (2022-11-09)


### :bug: Bug Fixes

* upyun url-options is not required ([9736a11](https://github.com/PicGo/PicGo-Core/commit/9736a11))



# :tada: 1.5.0-alpha.15 (2022-10-24)


### :bug: Bug Fixes

* tencent cos url encode bug ([eafb70f](https://github.com/PicGo/PicGo-Core/commit/eafb70f))



# :tada: 1.5.0-alpha.14 (2022-10-24)


### :bug: Bug Fixes

* url encode bug ([4c70e9b](https://github.com/PicGo/PicGo-Core/commit/4c70e9b))



# :tada: 1.5.0-alpha.13 (2022-10-19)


### :bug: Bug Fixes

* type error ([b934e8a](https://github.com/PicGo/PicGo-Core/commit/b934e8a))


### :package: Chore

* create oldRequest types ([749359a](https://github.com/PicGo/PicGo-Core/commit/749359a))



# :tada: 1.5.0-alpha.12 (2022-10-14)


### :bug: Bug Fixes

* types bug ([d77e6f3](https://github.com/PicGo/PicGo-Core/commit/d77e6f3))



# :tada: 1.5.0-alpha.11 (2022-10-13)



# :tada: 1.5.0-alpha.10 (2022-09-25)


### :sparkles: Features

* add zh-TW ([#135](https://github.com/PicGo/PicGo-Core/issues/135)) ([d111d6a](https://github.com/PicGo/PicGo-Core/commit/d111d6a))
* update linux.sh ([#134](https://github.com/PicGo/PicGo-Core/issues/134)) ([2910c20](https://github.com/PicGo/PicGo-Core/commit/2910c20))


### :bug: Bug Fixes

* some texts in zh-TW ([#136](https://github.com/PicGo/PicGo-Core/issues/136)) ([907e6c9](https://github.com/PicGo/PicGo-Core/commit/907e6c9))
* url image download bug & tencent cos url encode bug ([53d54f8](https://github.com/PicGo/PicGo-Core/commit/53d54f8))



# :tada: 1.5.0-alpha.9 (2022-09-03)


### :sparkles: Features

* finish request -> axios ([b89cf1e](https://github.com/PicGo/PicGo-Core/commit/b89cf1e))


### :bug: Bug Fixes

* qiniu error msg can't show ([0e4661b](https://github.com/PicGo/PicGo-Core/commit/0e4661b))
* sm.ms backupDomain message text ([45424d1](https://github.com/PicGo/PicGo-Core/commit/45424d1))
* when request-options resolveWithFullResponse is false bug ([eb8217a](https://github.com/PicGo/PicGo-Core/commit/eb8217a))



# :tada: 1.5.0-alpha.8 (2022-08-27)


### :sparkles: Features

* add backupDomain for sm.ms ([c6d54f1](https://github.com/PicGo/PicGo-Core/commit/c6d54f1))
* add debug logger type ([4342268](https://github.com/PicGo/PicGo-Core/commit/4342268))
* add picgo.use for easily using plugin ([c0107f1](https://github.com/PicGo/PicGo-Core/commit/c0107f1))


### :bug: Bug Fixes

* sometime tencent-cloud error message is empty ([6355e1b](https://github.com/PicGo/PicGo-Core/commit/6355e1b))



# :tada: 1.5.0-alpha.7 (2022-08-20)


### :sparkles: Features

* finish i18n text ([11b3197](https://github.com/PicGo/PicGo-Core/commit/11b3197))


### :bug: Bug Fixes

* aliyun content-type -> Content-Type ([a649fcc](https://github.com/PicGo/PicGo-Core/commit/a649fcc))



# :tada: 1.5.0-alpha.6 (2022-08-17)


### :bug: Bug Fixes

* tencent cos upload error ([61df53a](https://github.com/PicGo/PicGo-Core/commit/61df53a))



# :tada: 1.5.0-alpha.5 (2022-07-31)


### :sparkles: Features

* add log file size limit ([158be01](https://github.com/PicGo/PicGo-Core/commit/158be01))
* change inner db to @picgo/store ([0e90af3](https://github.com/PicGo/PicGo-Core/commit/0e90af3))


### :bug: Bug Fixes

* build error ([674a6b5](https://github.com/PicGo/PicGo-Core/commit/674a6b5))



# :tada: 1.5.0-alpha.4 (2022-05-26)


### :sparkles: Features

* add userAgent for tencent cloud COS ([acac59a](https://github.com/PicGo/PicGo-Core/commit/acac59a))



# :tada: 1.5.0-alpha.3 (2022-04-04)


### :bug: Bug Fixes

* picgo-gui clipboard image uploading error ([1302f76](https://github.com/PicGo/PicGo-Core/commit/1302f76))



# :tada: 1.5.0-alpha.2 (2022-04-03)


### :sparkles: Features

* add wayland support for linux ([#119](https://github.com/PicGo/PicGo-Core/issues/119)) ([28905f2](https://github.com/PicGo/PicGo-Core/commit/28905f2))


### :bug: Bug Fixes

* qiniu && upyun errors ([587dd3f](https://github.com/PicGo/PicGo-Core/commit/587dd3f))



# :tada: 1.5.0-alpha.1 (2022-03-08)


### :sparkles: Features

* add options for tencent cos ([1fccdcc](https://github.com/PicGo/PicGo-Core/commit/1fccdcc)), closes [#117](https://github.com/PicGo/PicGo-Core/issues/117)
* **i18n:** add i18n for picgo ([4b93a76](https://github.com/PicGo/PicGo-Core/commit/4b93a76))


### :bug: Bug Fixes

* build error in windows ([5616fb9](https://github.com/PicGo/PicGo-Core/commit/5616fb9))


### :package: Chore

* add alpha branch for alpha version ([6882022](https://github.com/PicGo/PicGo-Core/commit/6882022)), closes [#106](https://github.com/PicGo/PicGo-Core/issues/106)



# :tada: 1.5.0-alpha.0 (2021-10-26)


### :package: Chore

* **build:** migrate to esbuild and change export assignment to esm export ([#102](https://github.com/PicGo/PicGo-Core/issues/102)) ([2a6cd18](https://github.com/PicGo/PicGo-Core/commit/2a6cd18))



## :tada: 1.4.26 (2021-08-23)


### :bug: Bug Fixes

* engine bug in package.json ([1c65144](https://github.com/PicGo/PicGo-Core/commit/1c65144))



## :tada: 1.4.25 (2021-08-21)


### :bug: Bug Fixes

* handle clipboard file path error ([ff4ec86](https://github.com/PicGo/PicGo-Core/commit/ff4ec86)), closes [#97](https://github.com/PicGo/PicGo-Core/issues/97)
* **error:** throw error when transform failed ([#96](https://github.com/PicGo/PicGo-Core/issues/96)) ([57fce75](https://github.com/PicGo/PicGo-Core/commit/57fce75))
* clipboard path contains space ([#95](https://github.com/PicGo/PicGo-Core/issues/95)) ([d2b73c1](https://github.com/PicGo/PicGo-Core/commit/d2b73c1))



## :tada: 1.4.24 (2021-08-01)


### :sparkles: Features

* uploaded now can be modified since picgo will not use this value ([b6a8b58](https://github.com/PicGo/PicGo-Core/commit/b6a8b58))



## :tada: 1.4.23 (2021-07-27)


### :bug: Bug Fixes

* cases when clipboard of wsl contain image file ([#91](https://github.com/PicGo/PicGo-Core/issues/91)) ([adfc55e](https://github.com/PicGo/PicGo-Core/commit/adfc55e))


### :package: Chore

* add github actions for publishing ([caae80e](https://github.com/PicGo/PicGo-Core/commit/caae80e))



## :tada: 1.4.22 (2021-07-27)


### :sparkles: Features

* **smms:** smms now supports image without token ([#89](https://github.com/PicGo/PicGo-Core/issues/89)) ([456b81c](https://github.com/PicGo/PicGo-Core/commit/456b81c))
* add support for clipboard in wsl ([#87](https://github.com/PicGo/PicGo-Core/issues/87)) ([3e230de](https://github.com/PicGo/PicGo-Core/commit/3e230de))



## :tada: 1.4.21 (2021-05-09)


### :bug: Bug Fixes

* output empty after uploading when using isolate context ([79c228b](https://github.com/PicGo/PicGo-Core/commit/79c228b))



## :tada: 1.4.20 (2021-05-09)


### :sparkles: Features

* add createContext for each upload process ([ecde023](https://github.com/PicGo/PicGo-Core/commit/ecde023))


### :package: Chore

* add debug launch.json ([9950259](https://github.com/PicGo/PicGo-Core/commit/9950259))



## :tada: 1.4.19 (2021-04-04)


### :sparkles: Features

* add current uploader && transformer log ([67b2bb1](https://github.com/PicGo/PicGo-Core/commit/67b2bb1))
* limit some of config's capabilities ([f901505](https://github.com/PicGo/PicGo-Core/commit/f901505))



## :tada: 1.4.18 (2021-03-06)


### :bug: Bug Fixes

* unregister plugin delete pluginMap ([85228d8](https://github.com/PicGo/PicGo-Core/commit/85228d8))



## :tada: 1.4.17 (2021-02-09)


### :bug: Bug Fixes

* **type:** type error in index.d.ts ([f617658](https://github.com/PicGo/PicGo-Core/commit/f617658)), closes [#69](https://github.com/PicGo/PicGo-Core/issues/69)



## :tada: 1.4.16 (2021-02-08)


### :sparkles: Features

* add proxy & registry options for pluginHandler ([b10b963](https://github.com/PicGo/PicGo-Core/commit/b10b963))
* dynamic proxy getter with ctx.Request.request ([687805f](https://github.com/PicGo/PicGo-Core/commit/687805f)), closes [#64](https://github.com/PicGo/PicGo-Core/issues/64)
* supporting install specific version of plugin ([35e15b0](https://github.com/PicGo/PicGo-Core/commit/35e15b0))



## :tada: 1.4.15 (2021-01-24)


### :sparkles: Features

* add local plugin install/uninstall/update support & imporve plugin name handler ([f8ec464](https://github.com/PicGo/PicGo-Core/commit/f8ec464))



## :tada: 1.4.14 (2020-12-19)


### :bug: Bug Fixes

* types error ([303a4ec](https://github.com/PicGo/PicGo-Core/commit/303a4ec))



## :tada: 1.4.13 (2020-12-19)


### :sparkles: Features

* new addPlugin api for node projects ([5a18432](https://github.com/PicGo/PicGo-Core/commit/5a18432))


### :bug: Bug Fixes

* **type:** some type error ([233a6ca](https://github.com/PicGo/PicGo-Core/commit/233a6ca))
* pluginLoader can't get the full plugin list ([83535b9](https://github.com/PicGo/PicGo-Core/commit/83535b9)), closes [#60](https://github.com/PicGo/PicGo-Core/issues/60)



## :tada: 1.4.12 (2020-11-04)


### :bug: Bug Fixes

* let tcyun error info more detail ([ddf645f](https://github.com/PicGo/PicGo-Core/commit/ddf645f))
* not encode before uploading an image with url ([c0aee32](https://github.com/PicGo/PicGo-Core/commit/c0aee32))
* qiniu error handler ([de94212](https://github.com/PicGo/PicGo-Core/commit/de94212))



## :tada: 1.4.11 (2020-07-12)


### :bug: Bug Fixes

* initailize db function error ([df7d526](https://github.com/PicGo/PicGo-Core/commit/df7d526))



## :tada: 1.4.10 (2020-06-28)


### :bug: Bug Fixes

* url image hash bug ([e405221](https://github.com/PicGo/PicGo-Core/commit/e405221))



## :tada: 1.4.9 (2020-06-27)


### :sparkles: Features

* add plugin running && error logs ([6adc070](https://github.com/PicGo/PicGo-Core/commit/6adc070))
* **transformer:** add fallback to support more image formats such as HEIC ([0f5d2a9](https://github.com/PicGo/PicGo-Core/commit/0f5d2a9)), closes [#13](https://github.com/PicGo/PicGo-Core/issues/13)


### :bug: Bug Fixes

* multiline logs format ([444a42f](https://github.com/PicGo/PicGo-Core/commit/444a42f))
* the issue of lost logs ([daa7508](https://github.com/PicGo/PicGo-Core/commit/daa7508))
* the order of the uploaded list may not be the same as the order entered ([2bf1ed9](https://github.com/PicGo/PicGo-Core/commit/2bf1ed9)), closes [#40](https://github.com/PicGo/PicGo-Core/issues/40)
* unregisterPlugin's bug ([966bfd8](https://github.com/PicGo/PicGo-Core/commit/966bfd8))


### :package: Chore

* add vscode workspace settings & migrate tslint to eslint ([50a4842](https://github.com/PicGo/PicGo-Core/commit/50a4842))



## :tada: 1.4.8 (2020-04-04)


### :bug: Bug Fixes

* encode url before finishing ([7a6b39c](https://github.com/PicGo/PicGo-Core/commit/7a6b39c))
* return true if decodeURI throw error to avoid crash ([d09d77a](https://github.com/PicGo/PicGo-Core/commit/d09d77a))
* win10 cmd crash bug when "picgo upload" ([#35](https://github.com/PicGo/PicGo-Core/issues/35)) ([deec252](https://github.com/PicGo/PicGo-Core/commit/deec252))



## :tada: 1.4.7 (2020-03-07)


### :sparkles: Features

* add smms-v2 support ([7e10655](https://github.com/PicGo/PicGo-Core/commit/7e10655))
* remove weibo support ([96b2b3a](https://github.com/PicGo/PicGo-Core/commit/96b2b3a))


### :pencil: Documentation

* update README ([aff6326](https://github.com/PicGo/PicGo-Core/commit/aff6326))



## :tada: 1.4.6 (2020-02-23)


### :bug: Bug Fixes

* auto generate a local png bug ([c54ac67](https://github.com/PicGo/PicGo-Core/commit/c54ac67))



## :tada: 1.4.5 (2020-02-23)


### :sparkles: Features

* add upload image from URL support ([0d87342](https://github.com/PicGo/PicGo-Core/commit/0d87342))


### :package: Chore

* travis-ci deploy option ([a2a89cd](https://github.com/PicGo/PicGo-Core/commit/a2a89cd))



## :tada: 1.4.4 (2019-12-30)


### :bug: Bug Fixes

* image_repeated error from smms ([#28](https://github.com/PicGo/PicGo-Core/issues/28)) ([f246b8d](https://github.com/PicGo/PicGo-Core/commit/f246b8d))



## :tada: 1.4.3 (2019-12-27)


### :sparkles: Features

* add aliyun optionUrl option ([0a3bdea](https://github.com/PicGo/PicGo-Core/commit/0a3bdea))



## :tada: 1.4.2 (2019-12-26)


### :bug: Bug Fixes

* cli source ([be6cdcc](https://github.com/PicGo/PicGo-Core/commit/be6cdcc))



## :tada: 1.4.1 (2019-12-26)



# :tada: 1.4.0 (2019-12-26)


### :sparkles: Features

* add config methods && pluginHandler to ctx ([f9bb9fb](https://github.com/PicGo/PicGo-Core/commit/f9bb9fb))
* **plugin:** passing environment variables ([50467c7](https://github.com/PicGo/PicGo-Core/commit/50467c7))


### :bug: Bug Fixes

* correct sm.ms err msg ([#18](https://github.com/PicGo/PicGo-Core/issues/18)) ([f0a4e8a](https://github.com/PicGo/PicGo-Core/commit/f0a4e8a))
* pluginHandler args length error ([e15eac2](https://github.com/PicGo/PicGo-Core/commit/e15eac2))


### :package: Chore

* **types:** added typings field to export type inform… ([#23](https://github.com/PicGo/PicGo-Core/issues/23)) ([8bb16e7](https://github.com/PicGo/PicGo-Core/commit/8bb16e7))



## :tada: 1.3.7 (2019-05-12)


### :bug: Bug Fixes

* **clipboard:** clipboard image getter error in macOS ([8314604](https://github.com/PicGo/PicGo-Core/commit/8314604))



## :tada: 1.3.6 (2019-04-20)


### :bug: Bug Fixes

* clipboard image upload under win10 ([48b72ed](https://github.com/PicGo/PicGo-Core/commit/48b72ed))



## :tada: 1.3.5 (2019-04-15)


### :bug: Bug Fixes

* writing log sometimes disappeared ([d36c0ae](https://github.com/PicGo/PicGo-Core/commit/d36c0ae))


### :package: Chore

* add picgo bump version ([c312302](https://github.com/PicGo/PicGo-Core/commit/c312302))
