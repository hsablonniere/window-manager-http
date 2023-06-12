# window-manager-http

A gnome extension to expose your window manager with HTTP.

This is a work in progress.

## Details

* CORS is enabled
* HTTP port: `7000`
* password via `Authorization` header: `foobar`

## Endpoints

* `GET /windows`
* `GET /state`
* `POST /move-window`
