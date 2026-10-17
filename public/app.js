/* ===========================================================================
 * TSH knowledge base - single page application.
 *
 * Plain ES2020, no build step: React 18 + htm (both vendored, loaded as globals
 * in index.html) provide the component layer, everything else is native DOM/CSS.
 *
 * Layout follows the Kivy screen closely:
 *   top bar  : sync status / tools / additional menu / auth
 *   search   : auto-search toggle, request field, "by name" + "in content"
 *   new note : article title field + add button
 *   header   : Back - Edit - (Move|Select) - directory label ("parent / current")
 *   body     : left = inner layer (children) list, right = article content with
 *              language selectors, link buttons and the automatic table of
 *              contents of the inner layer
 * =========================================================================== */
(function () {
  "use strict";

  var React = window.React;
  var ReactDOM = window.ReactDOM;
  var htm = window.htm;
  if (!React || !ReactDOM || !htm) {
    document.getElementById("root").innerHTML =
      '<p class="fatal">React assets are missing from /vendor. Rebuild the frontend image.</p>';
    return;
  }
  var html = htm.bind(React.createElement);
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;
  var useRef = React.useRef;
  var useCallback = React.useCallback;

  var API = window.TSH_API;
  var LANG_KEY = "tsh.lang";
  var LANGS = [
    { code: "ru", label: "Рус", title: "Русский" },
    { code: "en", label: "Eng", title: "English" },
    { code: "es", label: "Esp", title: "Español" }
  ];

  /* ------------------------------------------------------------ utilities */
  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return (
      pad(date.getDate()) + "." + pad(date.getMonth() + 1) + "." +
      String(date.getFullYear()).slice(-2) + " " + pad(date.getHours()) + ":" +
      pad(date.getMinutes()) + ":" + pad(date.getSeconds())
    );
  }

  function useDebouncedEffect(effect, delay, deps) {
    var callback = useRef(effect);
    callback.current = effect;
    useEffect(function () {
      var timer = setTimeout(function () { callback.current(); }, delay);
      return function () { clearTimeout(timer); };
    }, deps);
  }

  // The API marks the matched words with [[...]] inside search snippets; turn
  // them into <mark> elements. Always highlights, the legacy second argument was
  // inverted by mistake and made every snippet plain text.
  function splitHighlighted(text) {
    if (!text) return [""];
    var parts = [];
    var pattern = /\[\[(.+?)\]\]/g;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      parts.push(h("mark", { key: "m" + match.index }, match[1]));
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  }

  function cleanSnippet(text) {
    if (!text) return "";
    return text.replace(/\[\[/g, "").replace(/\]\]/g, "");
  }

  /* ---------------------------------------------------------------- common */
  function Btn(props) {
    var extra = props.className ? " " + props.className : "";
    return h(
      "button",
      {
        type: props.type || "button",
        className: "btn" + extra + (props.active ? " is-active" : ""),
        disabled: props.disabled,
        title: props.title,
        onClick: props.onClick
      },
      props.children
    );
  }

  function Modal(props) {
    return html`<div className="modal-backdrop" onClick=${props.onClose}>
      <div className="modal" onClick=${function (event) { event.stopPropagation(); }}>
        <div className="modal-title">${props.title}</div>
        <div className="modal-body">${props.children}</div>
      </div>
    </div>`;
  }

  function ErrorBanner(props) {
    if (!props.error) return null;
    return html`<div className="banner banner-error">
      <span>${props.error}</span>
      <button type="button" className="banner-close" onClick=${props.onClose}>×</button>
    </div>`;
  }

  function Toast(props) {
    if (!props.message) return null;
    return html`<div className="toast">${props.message}</div>`;
  }

  /* ------------------------------------------------------------ login view */
  function LoginScreen(props) {
    var config = props.config || {};
    var registrationEnabled = config.registrationEnabled !== false;
    var minPassword = config.minPasswordLength || 8;

    var modeState = useState("login");
    var mode = modeState[0];
    var setMode = modeState[1];
    var loginState = useState({ username: "", password: "" });
    var loginForm = loginState[0];
    var setLoginForm = loginState[1];
    var registerState = useState({ username: "", password: "", confirm: "" });
    var registerForm = registerState[0];
    var setRegisterForm = registerState[1];
    var busy = useState(false);
    var pending = busy[0];
    var setPending = busy[1];
    var localErrorState = useState("");
    var localError = localErrorState[0];
    var setLocalError = localErrorState[1];

    function switchMode(next) {
      if (pending || next === mode) return;
      setMode(next);
      setLocalError("");
      if (props.onClearError) props.onClearError();
    }

    function submit(event) {
      event.preventDefault();
      if (pending) return;
      setLocalError("");

      if (mode === "register") {
        var username = registerForm.username.trim();
        if (username.length < 3) {
          setLocalError("Username must be at least 3 characters");
          return;
        }
        if (/\s/.test(username)) {
          setLocalError("Username must not contain spaces");
          return;
        }
        if (registerForm.password.length < minPassword) {
          setLocalError("Password must be at least " + minPassword + " characters");
          return;
        }
        if (registerForm.password !== registerForm.confirm) {
          setLocalError("The passwords do not match");
          return;
        }
        setPending(true);
        props
          .onRegister(username, registerForm.password)
          .then(function (result) {
            setPending(false);
            if (result && result.approved === false) {
              setLoginForm({ username: username, password: "" });
              setRegisterForm({ username: "", password: "", confirm: "" });
              setMode("login");
            }
          })
          .catch(function () { setPending(false); /* parent shows the error */ });
        return;
      }

      setPending(true);
      props
        .onSubmit(loginForm.username.trim(), loginForm.password)
        .catch(function () { /* parent shows the error */ })
        .then(function () { setPending(false); });
    }

    var errorText = props.error || localError;

    return html`<div className="login-screen">
      <form className="login-card" onSubmit=${submit}>
        <div className="login-brand">
          <div className="brand-mark">TSH</div>
          <div>
            <div className="brand-title">Knowledge base</div>
            <div className="brand-sub">${window.TSH_ENV.domain}</div>
          </div>
        </div>

        ${registrationEnabled
          ? html`<div className="login-tabs">
              <button
                type="button"
                className=${"login-tab" + (mode === "login" ? " is-active" : "")}
                onClick=${function () { switchMode("login"); }}>Sign in</button>
              <button
                type="button"
                className=${"login-tab" + (mode === "register" ? " is-active" : "")}
                onClick=${function () { switchMode("register"); }}>Create account</button>
            </div>`
          : null}

        ${mode === "register"
          ? html`<${React.Fragment}>
              <label className="field">
                <span>User</span>
                <input
                  autoFocus
                  type="text"
                  autocomplete="username"
                  value=${registerForm.username}
                  onInput=${function (e) { setRegisterForm(Object.assign({}, registerForm, { username: e.target.value })); }} />
              </label>
              <label className="field">
                <span>Password (min. ${minPassword} characters)</span>
                <input
                  type="password"
                  autocomplete="new-password"
                  value=${registerForm.password}
                  onInput=${function (e) { setRegisterForm(Object.assign({}, registerForm, { password: e.target.value })); }} />
              </label>
              <label className="field">
                <span>Repeat password</span>
                <input
                  type="password"
                  autocomplete="new-password"
                  value=${registerForm.confirm}
                  onInput=${function (e) { setRegisterForm(Object.assign({}, registerForm, { confirm: e.target.value })); }} />
              </label>
              <${Btn} type="submit" className="primary" disabled=${pending}>
                ${pending ? "Creating account…" : "Create account"}
              <//>
              <p className="hint">
                New accounts start unapproved and cannot sign in until an
                administrator approves them. Once approved they have read-only
                access; an admin can also promote them to moderator or admin.
              </p>
            <//>`
          : html`<${React.Fragment}>
              <label className="field">
                <span>User</span>
                <input
                  autoFocus
                  type="text"
                  autocomplete="username"
                  value=${loginForm.username}
                  onInput=${function (e) { setLoginForm(Object.assign({}, loginForm, { username: e.target.value })); }} />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  autocomplete="current-password"
                  value=${loginForm.password}
                  onInput=${function (e) { setLoginForm(Object.assign({}, loginForm, { password: e.target.value })); }} />
              </label>
              <${Btn} type="submit" className="primary" disabled=${pending}>
                ${pending ? "Signing in…" : "Sign in"}
              <//>
              <p className="hint">
                <b>user</b> - read only · <b>moderator</b> - edit and move
                articles · <b>admin</b> - full access, including users.
              </p>
            <//>`}

        ${props.notice ? html`<p className="login-notice">${props.notice}</p>` : null}
        ${errorText ? html`<p className="login-error">${errorText}</p>` : null}
      </form>
    </div>`;
  }

  /* ------------------------------------------------------------ tree panel */
  function TreePanel(props) {
    return html`<div className="tree-overlay" onClick=${props.onClose}>
      <aside className="tree-panel" onClick=${function (e) { e.stopPropagation(); }}>
        <header>
          <span>Table of contents</span>
          <button type="button" className="banner-close" onClick=${props.onClose}>×</button>
        </header>
        <div className="tree-body">
          ${props.loading
            ? html`<div className="muted">Loading…</div>`
            : html`<${TreeNode} node=${props.tree} depth=${0} onOpen=${props.onOpen} />`}
        </div>
      </aside>
    </div>`;
  }

  function TreeNode(props) {
    var open = useState(props.depth < 1);
    var expanded = open[0];
    var setExpanded = open[1];
    var node = props.node;
    if (!node) return null;
    var hasChildren = node.children && node.children.length > 0;
    return html`<div className="tree-node" style=${{ paddingLeft: props.depth * 12 + "px" }}>
      <div className="tree-row">
        <button
          type="button"
          className="tree-toggle"
          disabled=${!hasChildren}
          onClick=${function () { setExpanded(!expanded); }}>
          ${hasChildren ? (expanded ? "▾" : "▸") : "·"}
        </button>
        <button
          type="button"
          className="tree-label"
          onClick=${function () { props.onOpen(node.id); }}>
          ${node.name}
          ${node.child_count ? html`<span className="tree-count">${node.child_count}</span>` : null}
        </button>
      </div>
      ${expanded && hasChildren
        ? node.children.map(function (child) {
            return html`<${TreeNode} key=${child.id} node=${child} depth=${props.depth + 1} onOpen=${props.onOpen} />`;
          })
        : null}
    </div>`;
  }

  /* --------------------------------------------------------- article lists */
  function ArticleList(props) {
    if (props.loading) return html`<div className="list-empty muted">Loading…</div>`;
    var items = props.items || [];
    if (!items.length) {
      return html`<div className="list-empty muted">Здесь пока пусто / nothing here yet</div>`;
    }
    return html`<div className="article-list">
      ${items.map(function (item, index) {
        return html`<button
          type="button"
          key=${(item.id || "") + "-" + index}
          className=${"article-row" + (props.selectedId === item.id ? " is-selected" : "")}
          onClick=${function () { props.onPick(item); }}
          onDoubleClick=${function () { props.onOpen(item); }}>
          <span className="article-row-name">${item.name}</span>
          ${item.child_count
            ? html`<span className="article-row-badge">${item.child_count}</span>`
            : null}
        </button>`;
      })}
    </div>`;
  }

  function SearchResults(props) {
    if (props.loading) return html`<div className="list-empty muted">Searching…</div>`;
    if (!props.result) {
      return html`<div className="list-empty muted">
        Введите запрос. Результаты появятся здесь.<br />
        Type a request; matches appear here.
      </div>`;
    }
    var exact = props.result.exact || [];
    var partial = props.result.partial || [];
    return html`<div className="article-list">
      ${exact.map(function (hit) {
        return html`<button
          type="button"
          key=${"e" + hit.id}
          className="article-row search-row"
          onClick=${function () { props.onOpen(hit.id); }}>
          <span className="article-row-name">${hit.name}</span>
          <span className="article-row-path">${hit.path || hit.parentName || ""}</span>
        </button>`;
      })}
      <div className="list-separator">
        Partial match (${partial.length}) · ${props.result.tookMs} ms
      </div>
      ${partial.map(function (hit) {
        return html`<button
          type="button"
          key=${"p" + hit.id}
          className="article-row search-row"
          onClick=${function () { props.onOpen(hit.id); }}>
          <span className="article-row-name">${hit.name}</span>
          <span className="article-row-path">${hit.path || ""}</span>
          ${hit.snippet
            ? html`<span className="article-row-snippet">
                ${splitHighlighted(hit.snippet)}
              </span>`
            : null}
          ${hit.matchedTerms && hit.matchedTerms.length
            ? html`<span className="article-row-terms">
                ${hit.matchedTerms.map(function (term) {
                  return html`<span key=${term} className="term">${term}</span>`;
                })}
              </span>`
            : null}
        </button>`;
      })}
    </div>`;
  }

  /* --------------------------------------------------------- article body */
  function LanguageSelectors(props) {
    return html`<div className="lang-selectors">
      ${LANGS.map(function (lang) {
        var available = (props.availableLanguages || []).indexOf(lang.code) >= 0;
        return html`<button
          type="button"
          key=${lang.code}
          title=${lang.title + (available ? "" : " — no translation, showing fallback")}
          className=${"lang-chip" + (props.lang === lang.code ? " is-active" : "") + (available ? "" : " is-missing")}
          onClick=${function () { props.onChange(lang.code); }}>
          ${lang.label}
        </button>`;
      })}
    </div>`;
  }

  function LinkRow(props) {
    var links = props.links || [];
    if (!links.length) return html`<div className="links-row muted">no links</div>`;
    return html`<div className="links-row">
      ${links.map(function (link, index) {
        return html`<button
          type="button"
          key=${(link.id || "unresolved") + index}
          className=${"link-chip" + (link.resolved ? "" : " is-unresolved")}
          title=${link.resolved
            ? (link.title || "") + " (" + link.id + ")"
            : "Не найдено: " + link.raw}
          disabled=${!link.resolved}
          onClick=${function () { if (link.id) props.onOpen(link.id); }}>
          ${link.label}
        </button>`;
      })}
    </div>`;
  }

  function ArticleBody(props) {
    var article = props.article;
    if (!article) return html`<div className="content-empty muted">Select an article.</div>`;
    var children = article.children || [];
    var content = cleanSnippet(article.content || "");
    var toc = "Содержание\n" + (children.length
      ? children.map(function (child) { return child.position + ". " + child.name; }).join("\n")
      : "1. Здесь пока пусто");
    return html`<section className="content">
      <div className="content-toolbar">
        <${LanguageSelectors}
          lang=${props.lang}
          availableLanguages=${article.availableLanguages}
          onChange=${props.onLangChange} />
        <div className="content-actions">
          ${props.canEdit
            ? html`<${Btn} onClick=${props.onEdit} title="Edit this article">Edit<//>`
            : null}
          <button type="button" className="btn ghost" onClick=${props.onReport}>Suggest</button>
        </div>
      </div>

      <${LinkRow} links=${article.links} onOpen=${props.onOpen} />

      <pre className="meta-line">${formatDate(article.createdAt)}; ${formatDate(article.updatedAt)} ${article.id}</pre>
      <pre className="meta-line">${article.parentName || "TSH"} / ${article.name}</pre>
      <pre className="content-body">${content}${content ? "\n\n" : ""}${toc}</pre>
    </section>`;
  }

  /* ------------------------------------------------------------- editor */
  function Editor(props) {
    var draft = props.draft;
    var article = props.article;
    return html`<section className="content editor">
      <div className="editor-head">
        <span className="editor-title">Editing</span>
        <span className="meta-line">${article ? article.id : ""}</span>
      </div>
      <label className="field">
        <span>Article title (${props.lang})</span>
        <input
          value=${draft.name}
          onInput=${function (e) { props.onDraft({ name: e.target.value }); }} />
      </label>
      <label className="field grow">
        <span>Content (${props.lang})</span>
        <textarea
          value=${draft.content}
          onChange=${function (e) { props.onDraft({ content: e.target.value }); }}
          onInput=${function (e) { props.onDraft({ content: e.target.value }); }}></textarea>
      </label>
      <div className="editor-foot">
        <${Btn} className="primary" disabled=${props.saving} onClick=${props.onSave}>
          ${props.saving ? "Saving…" : "Save"}
        <//>
        <${Btn} onClick=${props.onCancel}>Cancel<//>
        <span className="spacer"></span>
        <${Btn} onClick=${props.onMoveStart} title="Move this article to another parent">Move<//>
        ${props.canDelete
          ? html`<${Btn} className="danger" onClick=${props.onDeleteStart}>Delete<//>`
          : null}
      </div>
      <p className="hint">
        Links to other articles are written as <code>ищи &lt;name or id&gt;</code> on their own line.
        Missing translations fall back to Russian.
      </p>
    </section>`;
  }

  /* ------------------------------------------------------------ main app */
  function App() {
    var sessionState = useState(null);
    var session = sessionState[0];
    var setSession = sessionState[1];
    var bootingState = useState(true);
    var booting = bootingState[0];
    var setBooting = bootingState[1];
    var loginErrorState = useState("");
    var loginError = loginErrorState[0];
    var setLoginError = loginErrorState[1];
    var loginNoticeState = useState("");
    var loginNotice = loginNoticeState[0];
    var setLoginNotice = loginNoticeState[1];
    var authConfigState = useState({ registrationEnabled: true, minPasswordLength: 8 });
    var authConfig = authConfigState[0];
    var setAuthConfig = authConfigState[1];

    var langState = useState(localStorage.getItem(LANG_KEY) || "ru");
    var lang = langState[0];
    var setLang = langState[1];

    var currentState = useState(null);
    var current = currentState[0];
    var setCurrent = currentState[1];
    var loadingState = useState(false);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    var childrenItemsState = useState([]);
    var childrenItems = childrenItemsState[0];
    var setChildrenItems = childrenItemsState[1];

    /* Article shown in the right pane after a single click in ArticleList.
     * It never replaces `current`, so the left list keeps the current
     * folder's items; a double click (openArticle) clears it and navigates. */
    var previewState = useState(null);
    var preview = previewState[0];
    var setPreview = previewState[1];

    var modeState = useState("browse");
    var mode = modeState[0];
    var setMode = modeState[1];
    var moveTargetState = useState(null);
    var moveTarget = moveTargetState[0];
    var setMoveTarget = moveTargetState[1];

    var draftState = useState(null);
    var draft = draftState[0];
    var setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0];
    var setSaving = savingState[1];

    var searchTextState = useState("");
    var searchText = searchTextState[0];
    var setSearchText = searchTextState[1];
    var autoSearchState = useState(true);
    var autoSearch = autoSearchState[0];
    var setAutoSearch = autoSearchState[1];
    var scopeState = useState("name");
    var scope = scopeState[0];
    var setScope = scopeState[1];
    var searchResultState = useState(null);
    var searchResult = searchResultState[0];
    var setSearchResult = searchResultState[1];
    var searchingState = useState(false);
    var searching = searchingState[0];
    var setSearching = searchingState[1];

    var newNameState = useState("");
    var newName = newNameState[0];
    var setNewName = newNameState[1];

    var errorState = useState("");
    var error = errorState[0];
    var setError = errorState[1];
    var toastState = useState("");
    var toast = toastState[0];
    var setToast = toastState[1];
    var menuState = useState(false);
    var menu = menuState[0];
    var setMenu = menuState[1];
    var toolsState = useState(false);
    var tools = toolsState[0];
    var setTools = toolsState[1];
    var treeState = useState(false);
    var tree = treeState[0];
    var setTree = treeState[1];
    var treeDataState = useState(null);
    var treeData = treeDataState[0];
    var setTreeData = treeDataState[1];
    var updatesState = useState(null);
    var updates = updatesState[0];
    var setUpdates = updatesState[1];
    var usersState = useState(null);
    var users = usersState[0];
    var setUsers = usersState[1];
    var modalState = useState(null);
    var modal = modalState[0];
    var setModal = modalState[1];
    var importRef = useRef(null);
    var searchAbort = useRef(null);
    var previewSeq = useRef(0);
    var installEvent = useRef(null);
    var installableState = useState(false);
    var installable = installableState[0];
    var setInstallable = installableState[1];

    var admin = !!(session && session.admin);
    var canEdit = !!(session && (session.canEdit || session.admin || session.role === "moderator"));
    var roleLabel = session ? (session.role || "user") : "";

    /* The article the right pane works on: the single-clicked preview when
     * present, otherwise the article the user navigated into. */
    var displayed = preview || current;

    function report(error_) {
      var message = error_ && error_.message ? error_.message : String(error_);
      setError(message);
      window.TSH_LOG("error:", message);
    }

    function flash(message) {
      setToast(message);
      setTimeout(function () { setToast(""); }, 4000);
    }

    /* ------------------------------------------------------------ session */
    useEffect(function () {
      API.authConfig()
        .then(function (payload) { setAuthConfig(payload || {}); })
        .catch(function () { /* keep the permissive defaults */ });
      API.session()
        .then(function (payload) { setSession(payload); })
        .catch(function () { setSession(null); })
        .then(function () { setBooting(false); });
    }, []);

    /* ------------------------------------------------- installable web app */
    useEffect(function () {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(function (err) {
          window.TSH_LOG("service worker not registered:", err && err.message ? err.message : err);
        });
      }
      function onBeforeInstall(event) {
        /* keep the event so the Menu can trigger the browser install dialog */
        event.preventDefault();
        installEvent.current = event;
        setInstallable(true);
      }
      function onInstalled() {
        installEvent.current = null;
        setInstallable(false);
        flash("Installed - start it from your app list");
      }
      window.addEventListener("beforeinstallprompt", onBeforeInstall);
      window.addEventListener("appinstalled", onInstalled);
      return function () {
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }, []);

    function installApp() {
      setMenu(false);
      var event = installEvent.current;
      if (!event) {
        flash("Use the browser menu: “Install app” / “Add to Home Screen”");
        return;
      }
      installEvent.current = null;
      setInstallable(false);
      event.prompt();
      if (event.userChoice) {
        event.userChoice
          .then(function (choice) {
            if (choice && choice.outcome === "accepted") flash("Installing…");
          })
          .catch(function () {});
      }
    }

    function login(username, password) {
      setLoginError("");
      setLoginNotice("");
      return API.login(username, password)
        .then(function (payload) { setSession(payload); setError(""); })
        .catch(function (err) {
          setLoginError(err.status === 401 ? "Invalid user or password" : err.message);
          throw err;
        });
    }

    function register(username, password) {
      setLoginError("");
      setLoginNotice("");
      return API.register(username, password)
        .then(function (payload) {
          setLoginNotice(
            payload && payload.message
              ? payload.message
              : "Account created - an administrator must approve it"
          );
          return payload;
        })
        .catch(function (err) {
          setLoginError(err.status === 409 ? "This username is already taken" : err.message);
          throw err;
        });
    }

    function logout() {
      API.logout().then(function () { setSession(null); }).catch(report);
    }

    /* ------------------------------------------------------------ reading */
    var loadArticle = useCallback(
      function (id, language) {
        var target = language || lang;
        setPreview(null);
        previewSeq.current += 1;
        setLoading(true);
        return API.article(id, target)
          .then(function (article) {
            setCurrent(article);
            return API.children(id, target);
          })
          .then(function (items) {
            setChildrenItems(items || []);
            setLoading(false);
          })
          .catch(function (err) {
            setLoading(false);
            report(err);
          });
      },
      [lang]
    );

    useEffect(function () {
      if (!session) return;
      loadArticle("00000001");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    function openArticle(id) {
      setTree(false);
      setMode("browse");
      setMoveTarget(null);
      setSearchResult(null);
      setNewName("");
      loadArticle(id);
    }

    /* Single click: fetch the article and show it in ArticleBody, leaving
     * the current folder, the left list and all modes untouched. */
    function previewArticle(id, language) {
      if (mode !== "browse") return;
      var target = language || lang;
      var seq = previewSeq.current + 1;
      previewSeq.current = seq;
      return API.article(id, target)
        .then(function (article) {
          if (seq === previewSeq.current) setPreview(article);
        })
        .catch(function (err) {
          if (seq === previewSeq.current) report(err);
        });
    }

    function changeLang(next) {
      setLang(next);
      localStorage.setItem(LANG_KEY, next);
      if (preview) previewArticle(preview.id, next);
      else if (current) loadArticle(current.id, next);
    }

    function goBack() {
      if (mode === "move") { setMode("browse"); setMoveTarget(null); return; }
      if (mode === "edit") { setMode("browse"); setDraft(null); return; }
      if (preview) { setPreview(null); return; }
      if (!current) return;
      if (current.isRoot) { loadArticle(current.id); return; }
      var chain = current.breadcrumbs || [];
      var parent = chain.length >= 2 ? chain[chain.length - 2] : null;
      if (parent) openArticle(parent.id);
      else openArticle("00000001");
    }

    /* ------------------------------------------------------------- search */
    function runSearch(text, searchScope) {
      var query = (text === undefined ? searchText : text).trim();
      if (!query) { setSearchResult(null); return; }
      if (searchAbort.current) searchAbort.current.abort();
      var controller = new AbortController();
      searchAbort.current = controller;
      setSearching(true);
      setMode("browse");
      API.search(query, searchScope, lang, controller.signal)
        .then(function (result) {
          setSearchResult(result);
          setSearching(false);
        })
        .catch(function (err) {
          if (err.name === "AbortError") return;
          setSearching(false);
          report(err);
        });
    }

    useDebouncedEffect(
      function () {
        if (!autoSearch) return;
        var query = searchText.trim();
        if (!query) { setSearchResult(null); return; }
        runSearch(query, scope);
      },
      700,
      [searchText, autoSearch, scope, lang]
    );

    /* ----------------------------------------------------------- mutations */
    function startEdit() {
      if (!displayed) return;
      if (!canEdit) { report(new Error("Moderator rights are required to edit articles")); return; }
      var mine = (displayed.translations || []).filter(function (t) {
        return t.lang === displayed.lang;
      })[0] || { name: "", content: "" };
      setDraft({ name: mine.name || "", content: mine.content || "" });
      setMode("edit");
      setMoveTarget(null);
      setError("");
    }

    function saveEdit() {
      if (!draft || !displayed) return;
      var target = displayed;
      var wasPreview = !!preview;
      setSaving(true);
      var payload = { translations: {} };
      payload.translations[target.lang] = {
        name: draft.name,
        content: draft.content
      };
      API.updateArticle(target.id, payload, target.lang)
        .then(function (result) {
          setSaving(false);
          setMode("browse");
          setDraft(null);
          flash("Saved");
          if (wasPreview) { setPreview(result.article); return; }
          setCurrent(result.article);
          return API.children(target.id, target.lang)
            .then(function (items) { setChildrenItems(items || []); });
        })
        .catch(function (err) { setSaving(false); report(err); });
    }

    function requestMove() {
      if (!displayed) return;
      if (!canEdit) { report(new Error("Moderator rights are required to move articles")); return; }
      setMode("move");
      setMoveTarget(displayed.parentId || "00000001");
      flash("Select the new parent and press Select");
    }

    function confirmMove() {
      if (!displayed || !moveTarget) return;
      if (moveTarget === displayed.id) { report(new Error("An article cannot be its own parent")); return; }
      var target = displayed;
      var wasPreview = !!preview;
      API.moveArticle(target.id, moveTarget, target.lang)
        .then(function () {
          setMode("browse");
          flash("Moved");
          setPreview(null);
          loadArticle(wasPreview && current ? current.id : target.id);
        })
        .catch(report);
    }

    function createArticle() {
      var name = newName.trim();
      if (!name) { flash("Enter the article name first"); return; }
      if (!current) return;
      if (!canEdit) { report(new Error("Moderator rights are required to add articles")); return; }
      API.createArticle({
        name: name,
        parentId: current.id,
        content: "",
        lang: lang
      })
        .then(function (result) {
          setNewName("");
          flash("Article created");
          return loadArticle(result.article.id);
        })
        .catch(report);
    }

    function confirmDelete() {
      if (!displayed) return;
      if (!admin) { setModal(null); report(new Error("Admin rights are required to delete articles")); return; }
      var target = displayed;
      var wasPreview = !!preview;
      API.deleteArticle(target.id)
        .then(function () {
          setModal(null);
          setMode("browse");
          setPreview(null);
          flash("Deleted");
          loadArticle(wasPreview && current ? current.id : "00000001");
        })
        .catch(function (err) { setModal(null); report(err); });
    }

    /* --------------------------------------------------------------- users */
    function openUsers() {
      setMenu(false);
      API.users()
        .then(function (payload) { setUsers(payload.users || []); setModal("users"); })
        .catch(report);
    }

    function refreshUsers() {
      return API.users()
        .then(function (payload) { setUsers(payload.users || []); })
        .catch(report);
    }

    function changeUserRole(user, role) {
      if (user.role === role) return;
      API.updateUser(user.username, { role: role })
        .then(function () {
          flash("Role of " + user.username + " set to " + role);
          return refreshUsers();
        })
        .then(function () {
          if (session && user.username === session.username) {
            return API.session().then(setSession).catch(function () { setSession(null); });
          }
        })
        .catch(function (err) { report(err); refreshUsers(); });
    }

    function toggleUserActive(user) {
      API.updateUser(user.username, { active: !user.active })
        .then(function () {
          flash(user.username + (user.active ? " deactivated" : " activated"));
          return refreshUsers();
        })
        .then(function () {
          if (session && user.username === session.username) {
            return API.session().then(setSession).catch(function () { setSession(null); });
          }
        })
        .catch(function (err) { report(err); refreshUsers(); });
    }

    function toggleUserApproval(user) {
      API.updateUser(user.username, { approved: !user.approved })
        .then(function () {
          flash(user.username + (user.approved ? " approval revoked" : " approved"));
          return refreshUsers();
        })
        .then(function () {
          if (session && user.username === session.username) {
            return API.session().then(setSession).catch(function () { setSession(null); });
          }
        })
        .catch(function (err) { report(err); refreshUsers(); });
    }

    /* ---------------------------------------------------------------- misc */
    function openTree() {
      setTree(true);
      if (!treeData) {
        API.tree(lang).then(setTreeData).catch(report);
      }
    }

    function openUpdates() {
      setMenu(false);
      API.updates(lang)
        .then(function (payload) { setUpdates(payload); setModal("updates"); })
        .catch(report);
    }

    function markUpdatesRead() {
      API.markUpdatesRead()
        .then(function () { setModal(null); if (updates) setUpdates(Object.assign({}, updates, { unseen: 0 })); })
        .catch(report);
    }

    function showAll() {
      setMenu(false);
      setSearchResult(null);
      setSearchText("");
      setPreview(null);
      API.articles(lang, 2000)
        .then(function (payload) {
          setCurrent(null);
          setChildrenItems(payload.articles || []);
          setMode("browse");
          setLoading(false);
        })
        .catch(report);
    }

    function exportBackup() {
      setMenu(false);
      window.location.href = API.exportUrl();
    }

    function importBackup(event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      API.importBackup(file)
        .then(function (result) {
          flash(result.message + ": " + JSON.stringify(result.result));
          return loadArticle("00000001");
        })
        .catch(report);
      event.target.value = "";
      setMenu(false);
    }

    useEffect(function () {
      function onKey(event) {
        if (event.key === "Escape") {
          if (modal) { setModal(null); return; }
          if (mode !== "browse") { setMode("browse"); setDraft(null); setMoveTarget(null); return; }
          if (preview) { setPreview(null); return; }
        }
        if (event.key === "Backspace" && mode === "browse") {
          var tag = (event.target.tagName || "").toLowerCase();
          if (tag === "input" || tag === "textarea") return;
          event.preventDefault();
          goBack();
        }
      }
      window.addEventListener("keydown", onKey);
      return function () { window.removeEventListener("keydown", onKey); };
    });

    /* --------------------------------------------------------------- render */
    if (booting) {
      return html`<div className="boot">Loading TSH…</div>`;
    }

    if (!session) {
      return html`<${React.Fragment}>
        <${LoginScreen}
          onSubmit=${login}
          onRegister=${register}
          error=${loginError}
          notice=${loginNotice}
          config=${authConfig}
          onClearError=${function () { setLoginError(""); setLoginNotice(""); }} />
        <${Toast} message=${toast} />
      <//>`;
    }

    var headerText = current
      ? (current.breadcrumbs || []).slice(0, -1).map(function (item) { return item.name; }).join(" / ")
      : searchResult ? "Search results" : "All articles";
    var currentLabel = current ? current.name : "";
    var inMove = mode === "move";
    var inEdit = mode === "edit";

    return html`<div className="app${inMove ? " is-moving" : ""}">
      <header className="topbar">
        <button type="button" className="brand" onClick=${openTree} title="Table of contents">
          <span className="brand-mark">TSH</span>
          <span className="brand-title">Knowledge base</span>
        </button>
        <div className="topbar-center">
          <label className="switch">
            <input
              type="checkbox"
              checked=${autoSearch}
              onChange=${function (e) { setAutoSearch(e.target.checked); }} />
            <span>auto-search</span>
          </label>
          <span className="status-chip">${loading ? "Loading…" : searching ? "Searching…" : "Up to date"}</span>
        </div>
        <div className="topbar-right">
          <div className="dropdown">
            <${Btn} onClick=${function () { setTools(!tools); }}>Tools<//>
            ${tools ? html`<div className="dropdown-menu" onMouseLeave=${function () { setTools(false); }}>
              <div className="dropdown-item disabled">HashGen (не перенесено)</div>
              <div className="dropdown-item disabled">Escort Charter (внешний exe)</div>
              <div className="dropdown-item disabled">MAC-finder (внешний модуль)</div>
              <div className="dropdown-item disabled">Sokol Meteo (внешний модуль)</div>
              <div className="dropdown-item disabled">.wln Parser (внешний модуль)</div>
              <div className="dropdown-item disabled">Byte parser (внешний модуль)</div>
              <div className="dropdown-item disabled">Reclamations (внешний модуль)</div>
              <div className="dropdown-divider"></div>
              <div className="dropdown-note">
                These Kivy tools were deliberately left out of the migration.
              </div>
            </div>` : null}
          </div>
          <div className="dropdown">
            <${Btn} onClick=${function () { setMenu(!menu); }}>Menu<//>
            ${menu ? html`<div className="dropdown-menu" onMouseLeave=${function () { setMenu(false); }}>
              <button type="button" className="dropdown-item" onClick=${openUpdates}>
                Last added ${updates && updates.unseen ? "(" + updates.unseen + ")" : ""}
              </button>
              <button type="button" className="dropdown-item" onClick=${showAll}>Show all</button>
              <button type="button" className="dropdown-item" onClick=${function () { setMenu(false); openTree(); }}>
                Table of contents
              </button>
              <button
                type="button"
                className="dropdown-item"
                title=${installable ? "Install this site as a standalone app" : "Use the browser menu: Install app / Add to Home Screen"}
                onClick=${installApp}>
                Install app
              </button>
              <div className="dropdown-divider"></div>
              ${admin
                ? html`<${React.Fragment}>
                    <button type="button" className="dropdown-item" onClick=${openUsers}>
                      Users & access levels
                    </button>
                    <button type="button" className="dropdown-item" onClick=${exportBackup}>Export JSON</button>
                    <button type="button" className="dropdown-item" onClick=${function () { importRef.current.click(); }}>
                      Import JSON…
                    </button>
                  <//>`
                : null}
              <div className="dropdown-divider"></div>
              <div className="dropdown-note">
                User: ${session.username} · ${roleLabel}
                ${canEdit ? " · editing enabled" : " · read only"}
              </div>
              <button type="button" className="dropdown-item" onClick=${logout}>Sign out</button>
            </div>` : null}
          </div>
        </div>
      </header>

      <${ErrorBanner} error=${error} onClose=${function () { setError(""); }} />
      <div className="searchbar">
        <label className="switch">
          <input
            type="checkbox"
            checked=${autoSearch}
            onChange=${function (e) { setAutoSearch(e.target.checked); }} />
          <span>auto</span>
        </label>
        <input
          className="search-input"
          placeholder="Search the knowledge base…"
          value=${searchText}
          onInput=${function (e) { setSearchText(e.target.value); }}
          onKeyDown=${function (e) {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch(searchText, scope);
            }
            if (e.key === "Escape") { setSearchText(""); setSearchResult(null); }
          }} />
        <div className="scope-group">
          <${Btn}
            active=${scope === "name"}
            onClick=${function () { setScope("name"); }}
            title="Search article titles including the parent tree">by name<//>
          <${Btn}
            active=${scope === "content"}
            onClick=${function () { setScope("content"); }}
            title="Search article titles and content">in content<//>
        </div>
        <${Btn} className="primary" onClick=${function () { runSearch(searchText, scope); }}>Search<//>
        ${searchResult
          ? html`<${Btn} onClick=${function () { setSearchResult(null); setSearchText(""); }}>Clear<//>`
          : null}
      </div>

      <div className="addbar">
        <input
          className="add-input"
          placeholder=${current ? "New article inside “" + current.name + "”" : "Open a folder to add an article"}
          value=${newName}
          disabled=${!canEdit || !current}
          onInput=${function (e) { setNewName(e.target.value); }}
          onKeyDown=${function (e) { if (e.key === "Enter") createArticle(); }} />
        <${Btn}
          disabled=${!canEdit || !current}
          title=${canEdit ? "Create the article here" : "Moderator rights are required"}
          onClick=${createArticle}>Add article<//>
      </div>

      <div className="section-header">
        <${Btn} onClick=${goBack} title="Back (Backspace)">Back<//>
        <${Btn}
          className=${inEdit ? "" : "primary"}
          disabled=${!displayed}
          onClick=${inEdit ? saveEdit : startEdit}
          title=${canEdit ? "" : "Moderator rights are required to edit"}>
          ${inEdit ? "Save" : "Edit"}
        <//>
        ${inMove
          ? html`<${Btn} className="warn" onClick=${confirmMove}>Select<//>`
          : html`<${Btn} className="warn" onClick=${requestMove} disabled=${!displayed || !canEdit}>Move<//>`}
        <div className="directory-label" title=${headerText + " / " + currentLabel}>
          <span className="dir-parent">${headerText}</span>
          <span className="dir-sep">/</span>
          <span className="dir-current">${currentLabel}</span>
        </div>
        <span className="spacer"></span>
        <${Btn} onClick=${openTree}>Contents<//>
      </div>

      <main className="body">
        <section className="left">
          ${searchResult
            ? html`<${SearchResults}
                result=${searchResult}
                loading=${searching}
                onOpen=${openArticle} />`
            : html`<${ArticleList}
                items=${childrenItems}
                loading=${loading}
                selectedId=${displayed ? displayed.id : null}
                onPick=${function (item) { if (inMove) { setMoveTarget(item.id); } else { previewArticle(item.id); } }}
                onOpen=${function (item) { if (inMove) { setMoveTarget(item.id); } else { openArticle(item.id); } }} />`}
        </section>
        <section className="right">
          ${inEdit && draft
            ? html`<${Editor}
                article=${displayed}
                draft=${draft}
                lang=${lang}
                saving=${saving}
                onDraft=${function (patch) { setDraft(Object.assign({}, draft, patch)); }}
                onSave=${saveEdit}
                onCancel=${function () { setMode("browse"); setDraft(null); }}
                onMoveStart=${requestMove}
                canDelete=${admin}
                onDeleteStart=${function () { setModal("delete"); }} />`
            : html`<${ArticleBody}
                article=${displayed}
                lang=${lang}
                canEdit=${canEdit}
                onEdit=${startEdit}
                onLangChange=${changeLang}
                onOpen=${openArticle}
                onReport=${function () { setModal("report"); }} />`}
        </section>
      </main>

      <footer className="statusbar">
        <span>${session.username} · ${roleLabel} · ${lang}</span>
        <span className="spacer"></span>
        <span>${childrenItems.length} item(s) in the inner layer</span>
      </footer>

      ${tree
        ? html`<${TreePanel}
            tree=${treeData}
            loading=${!treeData}
            onClose=${function () { setTree(false); }}
            onOpen=${openArticle} />`
        : null}

      ${modal === "delete"
        ? html`<${Modal} title="Confirm deletion" onClose=${function () { setModal(null); }}>
            <p>Delete <b>${displayed ? displayed.name : ""}</b> and all nested articles?</p>
            <div className="modal-actions">
              <${Btn} className="danger" onClick=${confirmDelete}>Yes, delete<//>
              <${Btn} onClick=${function () { setModal(null); }}>No<//>
            </div>
          <//>`
        : null}

      ${modal === "updates" && updates
        ? html`<${Modal} title="Last added / updated" onClose=${function () { setModal(null); }}>
            <p className="muted">${updates.total} recorded changes, ${updates.unseen} unseen.</p>
            <div className="updates-list">
              ${updates.items.map(function (item, index) {
                return html`<div className="updates-row" key=${(item.id || "") + index}>
                  <span className="updates-action">${item.action}</span>
                  <button type="button" className="updates-name" onClick=${function () { setModal(null); openArticle(item.id); }}>
                    ${item.name}
                  </button>
                  <span className="muted">${item.actor || ""} · ${formatDate(item.at)}</span>
                </div>`;
              })}
            </div>
            <div className="modal-actions">
              <${Btn} className="primary" onClick=${markUpdatesRead}>Mark as read<//>
              <${Btn} onClick=${function () { setModal(null); }}>Close<//>
            </div>
          <//>`
        : null}

      ${modal === "users" && users
        ? html`<${Modal} title="Users and access levels" onClose=${function () { setModal(null); }}>
            <p className="muted">
              <b>user</b> - read only · <b>moderator</b> - create, edit, move
              (no delete) · <b>admin</b> - full access, including this list.
              Self-registered accounts stay <b>pending approval</b> and cannot
              sign in until approved here.
            </p>
            <div className="users-list">
              ${users.map(function (user) {
                var isSelf = session && user.username === session.username;
                return html`<div className=${"users-row" + (user.approved ? "" : " is-pending")} key=${user.username}>
                  <span className="users-name">
                    ${user.username}${isSelf ? " (you)" : ""}
                    <span className="users-meta">
                      ${user.approved
                        ? (user.active ? "approved · active" : "approved · disabled")
                        : "pending approval"}
                      ${user.lastLoginAt ? " · last login " + formatDate(user.lastLoginAt) : ""}
                    </span>
                  </span>
                  <select
                    className="users-role"
                    value=${user.role}
                    disabled=${isSelf}
                    title=${isSelf ? "You cannot change your own role here" : "Change access level"}
                    onChange=${function (event) { changeUserRole(user, event.target.value); }}>
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                  <${Btn}
                    className=${user.approved ? "warn" : "primary"}
                    disabled=${isSelf}
                    title=${isSelf
                      ? "You cannot change your own approval"
                      : (user.approved ? "Revoke approval and sign the account out" : "Approve this account")}
                    onClick=${function () { toggleUserApproval(user); }}>
                    ${user.approved ? "Revoke" : "Approve"}
                  <//>
                  <${Btn}
                    className=${user.active ? "danger" : ""}
                    disabled=${isSelf}
                    title=${isSelf ? "You cannot disable your own account" : ""}
                    onClick=${function () { toggleUserActive(user); }}>
                    ${user.active ? "Disable" : "Enable"}
                  <//>
                </div>`;
              })}
            </div>
            <div className="modal-actions">
              <${Btn} className="primary" onClick=${refreshUsers}>Refresh<//>
              <${Btn} onClick=${function () { setModal(null); }}>Close<//>
            </div>
          <//>`
        : null}

      ${modal === "report"
        ? html`<${Modal} title="Send suggestion" onClose=${function () { setModal(null); }}>
            <p className="muted">
              Copy the article text and send it to the maintainers
              (Telegram: @gvozdyaraara).
            </p>
            <textarea className="report-area" readOnly value=${displayed ? cleanSnippet(displayed.content) : ""}></textarea>
            <div className="modal-actions">
              <${Btn}
                className="primary"
                onClick=${function () {
                  var text = displayed ? cleanSnippet(displayed.content) : "";
                  if (navigator.clipboard) navigator.clipboard.writeText(text);
                  window.open("https://t.me/gvozdyaraara", "_blank");
                }}>Copy and open Telegram<//>
              <${Btn} onClick=${function () { setModal(null); }}>Close<//>
            </div>
          <//>`
        : null}

      <input
        ref=${importRef}
        type="file"
        accept="application/json,.json"
        style=${{ display: "none" }}
        onChange=${importBackup} />
      <${Toast} message=${toast} />
    </div>`;
  }

  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
