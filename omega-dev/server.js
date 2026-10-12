"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.OMEGA_PREVIEW_PORT || 5000);
const APP_PUBLIC = path.resolve(__dirname, "../public");
const PACKAGE_ROOT = path.join(
  __dirname,
  "approved-package",
  "omega-beacon-deployment-omega-01.00.00003-20261008"
);
const PACKAGE_ASSETS = path.join(PACKAGE_ROOT, "assets");
const PACKAGE_RUNTIME = path.join(PACKAGE_ROOT, "runtime");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const OMEGA_MANIFEST = {
  name: "Omega Beacon",
  short_name: "Omega Beacon",
  description: "Marine Assurance & Compliance Platform",
  start_url: "./index.html",
  display: "standalone",
  background_color: "#001840",
  theme_color: "#001840",
  icons: [
    {
      src: "/assets/omega/icons/pwa-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable",
    },
    {
      src: "/assets/omega/icons/pwa-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ],
};

function send(res, status, contentType, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    ...extraHeaders,
  });
  res.end(body);
}

function safeFile(root, relativePath) {
  const decoded = decodeURIComponent(relativePath);
  if (
    decoded.split(/[\\/]/).some((part) => part.startsWith(".")) ||
    decoded.split(/[\\/]/).includes("..")
  ) {
    return null;
  }

  const relative = decoded.replace(/^[/\\]+/, "");
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return null;
  }
  return absolute;
}

function replaceBrandText(source) {
  return source.replace(/C\.S\.V\.?\s+BEACON/gi, (match) =>
    match === match.toUpperCase() ? "OMEGA BEACON" : "Omega Beacon"
  );
}

function disableApplicationServiceWorker(source) {
  const start = source.indexOf("if ('serviceWorker' in navigator) {");
  if (start >= 0) {
    const end = source.indexOf(
      "\n}\n\nfunction printAllFilteredQuestions",
      start
    );
    if (end < 0) {
      throw new Error(
        "Unable to safely remove the shared app service-worker registration."
      );
    }
    source =
      source.slice(0, start) +
      "/* Service-worker registration disabled in Omega preview. */" +
      source.slice(end + 3);
  }
  if (source.includes("navigator.serviceWorker.register")) {
    throw new Error(
      "Omega preview refused to serve app.js with service-worker registration."
    );
  }
  return source;
}

function transformHtml(source, pathname) {
  source = replaceBrandText(source);
  source = source
    .replaceAll("./assets/csv-beacon-icon.png", "/assets/omega/icons/icon.png")
    .replaceAll(
      "./assets/csv-beacon-logo-full.png",
      "/assets/omega/logo-full.png"
    )
    .replaceAll("./assets/csv-beacon-logo.png", "/assets/omega/logo-header.png")
    .replaceAll(
      "./assets/csvb-login-icon-transparent-v01.png",
      "/assets/omega/icons/login-emblem.png"
    );

  if (pathname === "/q-dashboard.html") {
    source = source.replace(
      /(<img\b[^>]*class=["'][^"']*\bcsvb-brand-logo\b[^"']*["'][^>]*src=["'])[^"']*(["'])/i,
      "$1/assets/omega/logo-header.png$2"
    );
  }

  source = source.replace(
    /<script\b[^>]*src=["'][^"']*csvb-sw-register\.js[^"']*["'][^>]*>\s*<\/script>/gi,
    ""
  );

  const runtimeScripts = '<script src="/omega-brand-runtime.js"></script>';
  if (/<head\b[^>]*>/i.test(source)) {
    source = source.replace(/<head\b[^>]*>/i, `$&\n${runtimeScripts}`);
  }

  const globalStyles = '<link rel="stylesheet" href="/omega-profile.css">';
  if (/<\/head>/i.test(source)) {
    source = source.replace(/<\/head>/i, `${globalStyles}\n</head>`);
  }

  if (pathname === "/login.html") {
    source = source.replace(
      /<\/head>/i,
      '<link rel="stylesheet" href="/omega-login.css">\n</head>'
    );
    source = source.replace(
      /<\/body>/i,
      '<script src="/omega-login.js"></script>\n' +
        '<script src="/omega-profile.js"></script>\n</body>'
    );
  } else {
    source = source.replace(
      /<\/body>/i,
      '<script src="/omega-profile.js"></script>\n</body>'
    );
  }

  return source;
}

function serveFile(res, filePath, pathname) {
  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }

    let body = buffer;
    const extension = path.extname(filePath).toLowerCase();

    try {
      if (pathname === "/login.html") {
        body = Buffer.from(
          transformHtml(buffer.toString("utf8"), pathname)
        );
      } else if (extension === ".html") {
        body = Buffer.from(
          transformHtml(buffer.toString("utf8"), pathname)
        );
      } else if (pathname === "/app.js") {
        body = Buffer.from(
          disableApplicationServiceWorker(buffer.toString("utf8"))
        );
      }
    } catch (transformError) {
      console.error("Omega preview transformation failed for", pathname);
      send(res, 500, "text/plain; charset=utf-8", "Omega preview setup error");
      return;
    }

    send(
      res,
      200,
      MIME_TYPES[extension] || "application/octet-stream",
      body
    );
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed", {
      Allow: "GET, HEAD",
    });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, "http://omega-preview.local").pathname
    );
  } catch (_) {
    send(res, 400, "text/plain; charset=utf-8", "Invalid request path");
    return;
  }

  if (pathname === "/healthz") {
    send(res, 200, "text/plain; charset=utf-8", "Omega development preview ready");
    return;
  }

  if (pathname === "/omega-profile.css") {
    serveFile(res, path.join(__dirname, "omega-profile.css"), pathname);
    return;
  }
  if (pathname === "/omega-profile.js") {
    serveFile(res, path.join(__dirname, "omega-profile.js"), pathname);
    return;
  }
  if (pathname === "/omega-brand-runtime.js") {
    serveFile(
      res,
      path.join(PACKAGE_RUNTIME, "omega-brand-runtime.js"),
      pathname
    );
    return;
  }
  if (pathname === "/omega-login.css" || pathname === "/omega-login.js") {
    serveFile(
      res,
      path.join(PACKAGE_RUNTIME, path.basename(pathname)),
      pathname
    );
    return;
  }

  if (pathname === "/manifest.json") {
    send(
      res,
      200,
      MIME_TYPES[".json"],
      JSON.stringify(OMEGA_MANIFEST, null, 2)
    );
    return;
  }

  if (pathname === "/favicon.ico") {
    serveFile(res, path.join(PACKAGE_ASSETS, "icons/favicon.ico"), pathname);
    return;
  }

  if (pathname === "/service-worker.js") {
    send(res, 404, "text/plain; charset=utf-8", "Service workers are disabled");
    return;
  }

  if (pathname === "/csvb-sw-register.js") {
    send(
      res,
      200,
      MIME_TYPES[".js"],
      'window.CSVB_SW_STATUS = { registered: false, disabled: true };\n'
    );
    return;
  }

  if (pathname.startsWith("/assets/omega/")) {
    const assetPath = safeFile(
      PACKAGE_ASSETS,
      pathname.slice("/assets/omega/".length)
    );
    if (!assetPath) {
      send(res, 403, "text/plain; charset=utf-8", "Forbidden");
      return;
    }
    serveFile(res, assetPath, pathname);
    return;
  }

  if (pathname.startsWith("/omega-package/")) {
    const packagePath = safeFile(
      PACKAGE_ROOT,
      pathname.slice("/omega-package/".length)
    );
    if (!packagePath) {
      send(res, 403, "text/plain; charset=utf-8", "Forbidden");
      return;
    }
    serveFile(res, packagePath, pathname);
    return;
  }

  const appPath = safeFile(APP_PUBLIC, pathname === "/" ? "index.html" : pathname);
  if (!appPath) {
    send(res, 403, "text/plain; charset=utf-8", "Forbidden");
    return;
  }

  fs.stat(appPath, (error, stat) => {
    if (error || !stat.isFile()) {
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }
    serveFile(res, appPath, pathname === "/" ? "/index.html" : pathname);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Omega Beacon development preview listening on port ${PORT}`);
});
