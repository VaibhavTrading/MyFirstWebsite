/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7d3ee283'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "videos-config.js",
    "revision": "f9286ee2f3ac37b6e336c53a74bb3980"
  }, {
    "url": "tutorial-videos.js",
    "revision": "8f42dad85eda09a8cdb3ead04b195055"
  }, {
    "url": "trim-canvas.js",
    "revision": "c51b348cdcc8446f2eb2de098b062a1c"
  }, {
    "url": "style.css",
    "revision": "dc9d26385ff132b3c0bb3ec2017b8ca0"
  }, {
    "url": "smart-optimizer.js",
    "revision": "bc1c41f4a2155fe47e714acc7dada9ea"
  }, {
    "url": "site-router.js",
    "revision": "a8f3fc109ddfa745ce1bcd5212e77522"
  }, {
    "url": "site-config.js",
    "revision": "91a20c1878408c8f769f8fbe112534c6"
  }, {
    "url": "script.js",
    "revision": "9608f586da3f6aae6ee10bdfc07cc57d"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "1eb9e6fd7011275bb6268c88d2ae8833"
  }, {
    "url": "pwa-controller.js",
    "revision": "91b998d8c4cfce10f19c3170cd73f610"
  }, {
    "url": "pwa-512x512.png",
    "revision": "7b9cba8a2ca63e229c4e8b75f76bbd0c"
  }, {
    "url": "pwa-192x192.png",
    "revision": "140de30c8f6047a278a73fba0bf4be4f"
  }, {
    "url": "passport-maker.js",
    "revision": "065fe77595e4cb79ee3891d52f7e8ac6"
  }, {
    "url": "og-preview.jpg",
    "revision": "6f8258da8f72be62152baa3c62349f36"
  }, {
    "url": "monu_feature_showcase.jpg",
    "revision": "a45b41db936fd04c762c0e94f7bb17b7"
  }, {
    "url": "icon.svg",
    "revision": "bae1465cb566c7f5d743807c8ea0ab6d"
  }, {
    "url": "favicon.png",
    "revision": "884a5c25a49cd54304ba06167ffe5e10"
  }, {
    "url": "favicon.ico",
    "revision": "b09a6af53a78473c8859c9b8e31b6e89"
  }, {
    "url": "favicon-96x96.png",
    "revision": "884a5c25a49cd54304ba06167ffe5e10"
  }, {
    "url": "favicon-48x48.png",
    "revision": "7438a93547c74e66e4117f40d51a07c7"
  }, {
    "url": "favicon-144x144.png",
    "revision": "12898633f8fff002a613969f5162cd70"
  }, {
    "url": "editor.js",
    "revision": "bebfebb8e357a31a3698a4273b4f96ba"
  }, {
    "url": "context-menu.js",
    "revision": "6dd9ddf7c0b15bd5fba1dd96f4cb62f0"
  }, {
    "url": "browser-image-compression.js",
    "revision": "43205b0f1dc905f9f3bcd27122b6101d"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "23d01bf49f286a5fd21c2afbfefbda6a"
  }, {
    "url": "videos/image-editing-tools-poster.jpg",
    "revision": "320f3dd17a5e9dbb2ff0b092145b3e53"
  }, {
    "url": "videos/id-card-scanner-poster.jpg",
    "revision": "9490966deee4c06b408fe6dc2544f1c2"
  }, {
    "url": "videos/document-scanner-poster.jpg",
    "revision": "fbcf9ec1d5c7a6560216f8c22772d9ce"
  }, {
    "url": "mediapipe/wasm/vision_wasm_nosimd_internal.js",
    "revision": "cfc27210da601b077d9e44197e19bc86"
  }, {
    "url": "mediapipe/wasm/vision_wasm_internal.js",
    "revision": "818dc4628ec93bfc86c4ce324f0da4dd"
  }, {
    "url": "assets/aistudio/watermark_add_aef1133d.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/svtcompress_498a1187.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/svt512_81d5e5fe.png",
    "revision": null
  }, {
    "url": "assets/aistudio/smartvletool_banner.png",
    "revision": null
  }, {
    "url": "assets/aistudio/smartvletool_banner.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/photo_sign_resizer_c8c210fc.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/pdf_origenizer_1e52bf95.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/passport_photo_maker_bcceb724.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/page_aaaa35ad.css",
    "revision": null
  }, {
    "url": "assets/aistudio/page_a81faec2.js",
    "revision": null
  }, {
    "url": "assets/aistudio/image_to_pdf_8b1aabcf.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/image_d66119cf.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_d3872323.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_compress_33297c13.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/image_acbde4bb.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_929bce14.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_8757c94e.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_7089b165.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_6f8289ba.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_4823737e.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_3e84b39b.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_34843efc.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_15d7f959.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_102734c7.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_0f2a3be6.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_0a58ebe4.png",
    "revision": null
  }, {
    "url": "assets/aistudio/id_card_print_fd5b6cdf.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/hero_bg_banner.png",
    "revision": null
  }, {
    "url": "assets/aistudio/favicon_773ffe6d.png",
    "revision": null
  }, {
    "url": "assets/aistudio/document_enhance_tool_2ea982eb.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/bk_remove_js_ec9f57e0.js",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-07_at_10-47-05_Remix_All_in_One_Tools_for_Off_Google_AI_Studio_fd16f5fa.png",
    "revision": null
  }, {
    "url": "assets/aistudio/SVT_Logo_ac2e6fdb.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Gemini_Generated_Image_oj4tkeoj4tkeoj4t_469c242c.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Gemini_Generated_Image_oedxj3oedxj3oedx_65a15a70.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Gemini_Generated_Image_jz0t1fjz0t1fjz0t_62931ac1.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Format_Converter_b8d9f5b1.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Document_Studio_Neon_Feature_Showcase_b3130b6f.jpg",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "23d01bf49f286a5fd21c2afbfefbda6a"
  }, {
    "url": "browser-image-compression.js",
    "revision": "43205b0f1dc905f9f3bcd27122b6101d"
  }, {
    "url": "context-menu.js",
    "revision": "6dd9ddf7c0b15bd5fba1dd96f4cb62f0"
  }, {
    "url": "editor.js",
    "revision": "bebfebb8e357a31a3698a4273b4f96ba"
  }, {
    "url": "favicon-144x144.png",
    "revision": "12898633f8fff002a613969f5162cd70"
  }, {
    "url": "favicon-48x48.png",
    "revision": "7438a93547c74e66e4117f40d51a07c7"
  }, {
    "url": "favicon-96x96.png",
    "revision": "884a5c25a49cd54304ba06167ffe5e10"
  }, {
    "url": "favicon.ico",
    "revision": "b09a6af53a78473c8859c9b8e31b6e89"
  }, {
    "url": "favicon.png",
    "revision": "884a5c25a49cd54304ba06167ffe5e10"
  }, {
    "url": "icon.svg",
    "revision": "bae1465cb566c7f5d743807c8ea0ab6d"
  }, {
    "url": "manifest.webmanifest",
    "revision": "621cfb2e9300703c8b702095770e8ff4"
  }, {
    "url": "og-preview.jpg",
    "revision": "6f8258da8f72be62152baa3c62349f36"
  }, {
    "url": "passport-maker.js",
    "revision": "065fe77595e4cb79ee3891d52f7e8ac6"
  }, {
    "url": "pwa-192x192.png",
    "revision": "140de30c8f6047a278a73fba0bf4be4f"
  }, {
    "url": "pwa-512x512.png",
    "revision": "7b9cba8a2ca63e229c4e8b75f76bbd0c"
  }, {
    "url": "pwa-controller.js",
    "revision": "91b998d8c4cfce10f19c3170cd73f610"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "1eb9e6fd7011275bb6268c88d2ae8833"
  }, {
    "url": "script.js",
    "revision": "9608f586da3f6aae6ee10bdfc07cc57d"
  }, {
    "url": "site-config.js",
    "revision": "91a20c1878408c8f769f8fbe112534c6"
  }, {
    "url": "site-router.js",
    "revision": "a8f3fc109ddfa745ce1bcd5212e77522"
  }, {
    "url": "smart-optimizer.js",
    "revision": "bc1c41f4a2155fe47e714acc7dada9ea"
  }, {
    "url": "style.css",
    "revision": "dc9d26385ff132b3c0bb3ec2017b8ca0"
  }, {
    "url": "trim-canvas.js",
    "revision": "c51b348cdcc8446f2eb2de098b062a1c"
  }, {
    "url": "tutorial-videos.js",
    "revision": "8f42dad85eda09a8cdb3ead04b195055"
  }, {
    "url": "videos-config.js",
    "revision": "f9286ee2f3ac37b6e336c53a74bb3980"
  }, {
    "url": "manifest.webmanifest",
    "revision": "4d52d17ae8773dd86bec06c8e943def1"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(/^https:\/\/docs\.opencv\.org\/.*/i, new workbox.CacheFirst({
    "cacheName": "opencv-cdn-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/cdnjs\.cloudflare\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "cdnjs-cdn-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 20,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 20,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
