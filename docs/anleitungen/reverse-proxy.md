# Reverse Proxy

Aura läuft in der Web-Instanz unter `/aura/`. Der Proxy zeigt deshalb auf die **Web-Instanz** (z. B. `192.168.1.10:8082`), nicht auf Port 8095.

::: warning Ganze Domain weiterleiten, nicht nur /aura/
Das Frontend unter `/aura/` nutzt auch die oberste Ebene der Domain:

| Pfad | Wofür |
| --- | --- |
| `/?sid=…` (WebSocket) | Live-Werte – der Socket der Web-Instanz liegt auf `/` |
| `/socket.io/socket.io.js` | Socket-Bibliothek, lädt vor dem Dashboard |
| `/adapter/…`, `/lib/…` | Web-Komponenten, Adapter-Dateien |

Ein reines `location /aura/ { … }` auf einer Domain, die noch anderes ausliefert, zeigt eine Seite ohne Werte. Dann eine eigene (Sub-)Domain nehmen, z. B. `aura.example.com`.
:::

## Nginx Proxy Manager

| Feld | Wert |
| --- | --- |
| Domain Names | `aura.example.com` |
| Scheme | `http` – `https`, wenn die Web-Instanz HTTPS nutzt |
| Forward Hostname / IP | `192.168.1.10` |
| Forward Port | `8082` (Port der Web-Instanz) |
| Websockets Support | an |
| Cache Assets | aus (empfohlen) |
| SSL | Zertifikat (z. B. Let's Encrypt), Force SSL |

Optional `/` → `/aura/`, Tab **Advanced**:

```nginx
if ($request_uri = "/") {
    return 302 /aura/;
}
```

::: danger Nicht `location = / { return 302 /aura/; }`
`location` prüft nur den Pfad. Damit wird auch der WebSocket `/?sid=…` umgeleitet (302 statt 101) – das Dashboard bekommt keine Werte. `$request_uri` enthält den Query-String, `/?sid=…` passt deshalb nicht darauf.
:::

## nginx

```nginx
server {
    listen 443 ssl;
    server_name aura.example.com;
    ssl_certificate     /etc/letsencrypt/live/aura.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aura.example.com/privkey.pem;

    # optional: / → /aura/, der WebSocket /?sid=… bleibt unberührt
    if ($request_uri = "/") {
        return 302 /aura/;
    }

    location / {
        proxy_pass http://192.168.1.10:8082;   # https://… bei HTTPS in der Web-Instanz
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
    }
}
```

## Caddy

```caddy
aura.example.com {
    # optional: / → /aura/ ({uri} enthält den Query-String)
    @root expression {uri} == "/"
    redir @root /aura/ 302

    reverse_proxy 192.168.1.10:8082
}
```

WebSockets leitet Caddy von selbst weiter. Web-Instanz mit HTTPS und selbst signiertem Zertifikat:

```caddy
    reverse_proxy https://192.168.1.10:8082 {
        transport http {
            tls_insecure_skip_verify
        }
    }
```

## Prüfen

```bash
curl -sk -o /dev/null -w "%{http_code} %{redirect_url}\n" https://aura.example.com/        # 302 …/aura/ (mit Umleitung)
curl -sk -o /dev/null -w "%{http_code}\n" https://aura.example.com/socket.io/socket.io.js   # 200
curl -sk -i --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://aura.example.com/?sid=1" | head -1                                              # HTTP/1.1 101 Switching Protocols
```

## Probleme

| Symptom | Ursache |
| --- | --- |
| Seite lädt, keine Werte | WebSocket auf `/` wird umgeleitet (`location = /`) oder nicht weitergeleitet |
| „socket library not loaded“ | `/socket.io/socket.io.js` wird nicht weitergeleitet |
| Web-Komponenten (Kameras, Flow, …) laden nicht | `/adapter/…` oder `/lib/…` werden nicht weitergeleitet |
| „Aura has moved into the web adapter“ | Der Proxy zeigt noch auf Port 8095 – Ziel auf die Web-Instanz umstellen |
| Anmeldeseite des Web-Adapters | Anmeldung in der Web-Instanz aktiv – gilt jetzt auch für Aura |

Beim Umzug von Port 8095: **erst den Proxy umstellen, dann den eigenen Port abschalten**. Die Adresse (`https://aura.example.com`) bleibt gleich, Geräte behalten ihre Einstellungen; nur `/aura/` kommt dazu ([Umzug auf den Web-Adapter](./umzug-web-adapter)).
