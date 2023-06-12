imports.gi.versions.Soup = '3.0';

const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Soup = imports.gi.Soup;
const Mainloop = imports.mainloop;

// "foobar" with sha256
const HASHED_PASSWORD = 'c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2';

log(`WMHTTP register`);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sha256 = new GLib.Checksum(GLib.ChecksumType.SHA256);

function checkAuthentication (request) {
  const inputPasswordClear = request.headers.Authorization ?? '';
  sha256.reset();
  sha256.update(inputPasswordClear);
  const inputPasswordHash = sha256.get_string();
  return inputPasswordHash === HASHED_PASSWORD;
}

class Extension {

  _parseRequest (msg) {

    const method = msg.get_method();

    const rawHeaders = msg.get_request_headers();

    const headers = {};
    rawHeaders.foreach((name, value) => headers[name] = value);

    const uri = msg.get_uri();
    const pathname = uri.get_path();

    const rawSearch = uri.get_query();
    const searchParams = rawSearch != null
      ? GLib.Uri.parse_params(rawSearch, -1, '&', GLib.UriParamsFlags.NONE)
      : {};

    const rawBody = msg.get_request_body();
    const bodyAsText = decoder.decode(rawBody.data);
    let bodyAsJson;
    try {
      bodyAsJson = JSON.parse(bodyAsText);
    }
    catch (e) {
    }

    return {
      method,
      pathname,
      headers,
      searchParams,
      bodyAsText,
      bodyAsJson,
    };
  }

  _sendJson (msg, origin, status, data = '') {
    const json = JSON.stringify(data);
    const body = encoder.encode(json);
    const headers = msg.get_response_headers();
    headers.replace('access-control-allow-origin', origin);
    headers.replace('access-control-allow-credentials', 'true');
    headers.replace('access-control-allow-headers', 'authorization, origin, referer');
    headers.replace('access-control-allow-methods', '*');
    msg.set_status(status, null);
    msg.set_response('application/json', Soup.MemoryUse.COPY, body);
  }

  enable () {
    log(`WMHTTP enabling`);

    this.server = new Soup.Server();

    this.server.add_handler('/', (self, msg) => {

      const request = this._parseRequest(msg);
      console.log(request.headers);
      const origin = request.headers.Origin ?? request.headers.Referer ?? '*';
      console.log(request.method, request.pathname, JSON.stringify(request.searchParams), request.headers.Authorization);

      const isAuthenticated = checkAuthentication(request);

      if (request.method === 'OPTIONS') {
        this._sendJson(msg, origin, 200);
      }
      else if (!isAuthenticated) {
        this._sendJson(msg, origin, 401);
      }
      else if (request.method === 'GET' && request.pathname === '/windows') {
        const windows = global
          .get_window_actors()
          .map((actor) => {
            const win = actor.get_meta_window();
            const rect = win.get_frame_rect();
            const { x, y, width, height } = rect;
            return {
              id: win.get_id(),
              pid: win.get_pid(),
              name: win.get_title(),
              // display: win.get_display(),
              monitor: win.get_monitor(),
              workspace: win.get_workspace().index(),
              type: win.get_window_type(),
              isFullscreen: win.is_fullscreen(),
              isHidden: win.is_hidden(),
              x,
              y,
              width,
              height,
            };
          });
        this._sendJson(msg, origin, 200, windows);
      }
      else if (request.method === 'GET' && request.pathname === '/state') {
        const currentWorkspace = global.workspace_manager.get_active_workspace();
        const monitor = global.display.get_current_monitor();
        const workAreaAllMonitors = currentWorkspace.get_work_area_all_monitors();
        const workAreaCurrentMonitor = currentWorkspace.get_work_area_for_monitor(currentWorkspace.index());
        const state = {
          currentWorkspace: currentWorkspace.index(),
          monitor,
          workAreaAllMonitors: {
            x: workAreaAllMonitors.x,
            y: workAreaAllMonitors.y,
            width: workAreaAllMonitors.width,
            height: workAreaAllMonitors.height,
          },
          workAreaCurrentMonitor: {
            x: workAreaCurrentMonitor.x,
            y: workAreaCurrentMonitor.y,
            width: workAreaCurrentMonitor.width,
            height: workAreaCurrentMonitor.height,
          },
        };
        this._sendJson(msg, origin, 200, state);
      }
      else if (request.method === 'POST' && request.pathname === '/move-window') {

        const window = global
          .get_window_actors()
          .map((actor) => actor.get_meta_window())
          .find((win) => request.bodyAsJson.id === win.get_id());

        if (window != null) {
          const { above, minimize, stick, raise,focus } = request.bodyAsJson;
          if (minimize) {
            window.minimize();
          }
          else {
            window.unminimize();
            window.unmaximize(Meta.MaximizeFlags.BOTH);
            const { x, y, width, height } = request.bodyAsJson;
            window.move_resize_frame(false, x, y, width, height);
          }
          if (above) {
            window.make_above();
          }
          else {
            window.unmake_above();
          }
          if (focus) {
            window.focus();
          }
          if (raise) {
            window.raise();
          }
          if (stick) {
            window.stick();
          }
          else {
            window.unstick();
          }
        }
        this._sendJson(msg, origin, 200);
      }
      else {
        this._sendJson(msg, origin, 404);
      }
    });

    const portOk = this.server.listen_all(7000, Soup.ServerListenOptions.IPV4_ONLY);
    console.log('portOk', portOk);
  }

  disable () {
    log(`WMHTTP disabling`);
    this.server.remove_handler('/');
    this.server.disconnect();
  }
}

function init () {
  log(`WMHTTP initializing`);
  try {
    return new Extension();
  }
  catch (e) {
    log(`WMHTTP`, e);
  }
}

log(`WMHTTP register done`);
