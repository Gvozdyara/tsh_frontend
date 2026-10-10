/* TSH knowledge base - thin fetch wrapper.
 * The API is same origin (nginx proxies /api to the backend container). */
(function () {
  "use strict";

  var base = function () {
    return (window.TSH_ENV && window.TSH_ENV.apiBase) || "/api";
  };

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === "") return;
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  function ApiError(message, status, payload) {
    this.name = "ApiError";
    this.message = message;
    this.status = status;
    this.payload = payload;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function request(method, path, options) {
    options = options || {};
    var init = {
      method: method,
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    };
    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        init.body = options.body;
      } else {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }
    }
    if (options.signal) init.signal = options.signal;

    return fetch(base() + path + qs(options.query), init).then(function (response) {
      var contentType = response.headers.get("content-type") || "";
      var parser = contentType.indexOf("application/json") >= 0
        ? response.json()
        : response.text();
      return parser.catch(function () { return null; }).then(function (payload) {
        if (!response.ok) {
          var detail = payload && payload.detail ? payload.detail : response.statusText;
          throw new ApiError(detail, response.status, payload);
        }
        return payload;
      });
    });
  }

  window.TSH_API = {
    ApiError: ApiError,

    health: function () { return request("GET", "/health"); },

    login: function (username, password) {
      return request("POST", "/auth/login", { body: { username: username, password: password } });
    },
    logout: function () { return request("POST", "/auth/logout"); },
    session: function () { return request("GET", "/auth/session"); },

    langs: function () { return request("GET", "/langs"); },
    tree: function (lang) { return request("GET", "/tree", { query: { lang: lang } }); },
    articles: function (lang, limit) {
      return request("GET", "/articles", { query: { lang: lang, limit: limit } });
    },
    article: function (id, lang, inlineSingleLink) {
      return request("GET", "/articles/" + encodeURIComponent(id), {
        query: { lang: lang, inlineSingleLink: inlineSingleLink === false ? "false" : "true" }
      });
    },
    children: function (id, lang) {
      return request("GET", "/articles/" + encodeURIComponent(id) + "/children", {
        query: { lang: lang }
      });
    },

    createArticle: function (payload) {
      return request("POST", "/articles", { body: payload });
    },
    updateArticle: function (id, payload, lang) {
      return request("PATCH", "/articles/" + encodeURIComponent(id), {
        body: payload, query: { lang: lang }
      });
    },
    moveArticle: function (id, newParentId, lang) {
      return request("POST", "/articles/" + encodeURIComponent(id) + "/move", {
        body: { newParentId: newParentId }, query: { lang: lang }
      });
    },
    deleteArticle: function (id) {
      return request("DELETE", "/articles/" + encodeURIComponent(id));
    },
    reorder: function (id, orderedIds) {
      return request("POST", "/articles/" + encodeURIComponent(id) + "/reorder", {
        body: { orderedIds: orderedIds }
      });
    },

    search: function (query, scope, lang, signal) {
      return request("GET", "/search", {
        query: { q: query, scope: scope, lang: lang }, signal: signal
      });
    },
    suggest: function (query, lang) {
      return request("GET", "/search/suggest", { query: { q: query, lang: lang } });
    },

    updates: function (lang) { return request("GET", "/admin/updates", { query: { lang: lang } }); },
    markUpdatesRead: function () { return request("POST", "/admin/updates/read"); },
    importBackup: function (file) {
      var form = new FormData();
      form.append("file", file);
      return request("POST", "/admin/import", { body: form });
    },
    exportUrl: function () { return base() + "/admin/export"; }
  };
})();
