#!/usr/bin/env python3
"""Local HTTPS for iPhone testing. Serves web/ only; never exposes signing keys."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer, BaseHTTPRequestHandler
import html
import json
import argparse
import secrets
import hmac
from http.cookies import SimpleCookie
from urllib.parse import urlsplit, parse_qs, quote
import os
import shutil
import signal
import socket
import ssl
import subprocess
import threading
import time

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web'
PRIVATE=ROOT/'.local'
HTTPS_PORT=8443
SETUP_PORT=8766
ACCESS_KEY=''

def allowed(handler):
    if handler.client_address[0] in ('127.0.0.1','::1'):return True
    supplied=parse_qs(urlsplit(handler.path).query).get('access',[''])[0]
    cookies=SimpleCookie()
    try:cookies.load(handler.headers.get('Cookie',''))
    except Exception:pass
    cookie=cookies.get('__Host-FliteChek')
    return bool(ACCESS_KEY) and (hmac.compare_digest(supplied.encode(),ACCESS_KEY.encode()) or bool(cookie and hmac.compare_digest(cookie.value.encode(),ACCESS_KEY.encode())))

def command(*args):
    return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True).stdout.strip()

def network_identity():
    try: host=command('scutil','--get','LocalHostName')+'.local'
    except (OSError,subprocess.CalledProcessError): host=socket.gethostname().split('.')[0]+'.local'
    ip=None
    for interface in ('en0','en1'):
        try:
            result=command('ipconfig','getifaddr',interface)
            socket.inet_aton(result)
            ip=result
            break
        except (OSError,subprocess.CalledProcessError): pass
    return host,ip

def certificates(host,ip):
    if not shutil.which('openssl'): raise RuntimeError('OpenSSL is required for the local HTTPS certificate.')
    PRIVATE.mkdir(exist_ok=True,mode=0o700)
    os.chmod(PRIVATE,0o700)
    ca_key=PRIVATE/'root-key.pem';ca=PRIVATE/'root.pem'
    if not ca.exists():
        config=PRIVATE/'root.cnf'
        config.write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=FliteChek Local Testing\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n')
        command('openssl','req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','3650','-keyout',str(ca_key),'-out',str(ca),'-config',str(config))
        os.chmod(ca_key,0o600)
    command('openssl','x509','-in',str(ca),'-outform','DER','-out',str(PRIVATE/'FliteChek-root.cer'))
    names=f'DNS:{host},DNS:localhost,IP:127.0.0.1'+(f',IP:{ip}' if ip else '')
    identity=PRIVATE/'identity.txt'
    if not (PRIVATE/'server.pem').exists() or not identity.exists() or identity.read_text()!=names:
        req=PRIVATE/'server.cnf'
        req.write_text(f'[req]\nprompt=no\ndistinguished_name=dn\n[dn]\nCN={host}\n')
        ext=PRIVATE/'server.ext'
        ext.write_text(f'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName={names}\n')
        command('openssl','req','-new','-newkey','rsa:2048','-nodes','-keyout',str(PRIVATE/'server-key.pem'),'-out',str(PRIVATE/'server.csr'),'-config',str(req))
        command('openssl','x509','-req','-in',str(PRIVATE/'server.csr'),'-CA',str(ca),'-CAkey',str(ca_key),'-CAcreateserial','-out',str(PRIVATE/'server.pem'),'-days','365','-sha256','-extfile',str(ext))
        os.chmod(PRIVATE/'server-key.pem',0o600)
        identity.write_text(names)
    return command('openssl','x509','-in',str(ca),'-noout','-fingerprint','-sha256')

def install_manifest():
    manifest=json.loads((WEB/'manifest.webmanifest').read_text())
    # Home Screen apps may have their own cookie jar. Bootstrap that jar on launch.
    if ACCESS_KEY:manifest['start_url']='./install?access='+quote(ACCESS_KEY)
    return json.dumps(manifest).encode()

class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(WEB),**kwargs)
    def do_GET(self):
        if not allowed(self):self.send_error(403,'Use the private setup link printed on your Mac.');return
        parsed=urlsplit(self.path)
        if parsed.path=='/install':
            # Keep the access-bearing installation URL visible. iOS can save the
            # current page URL instead of the manifest start_url when installing.
            data=(WEB/('update.html' if parse_qs(parsed.query).get('update')==['1'] else 'index.html')).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Set-Cookie',f'__Host-FliteChek={ACCESS_KEY}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000')
            self.end_headers();self.wfile.write(data);return
        if parsed.path=='/manifest.webmanifest':
            data=install_manifest()
            self.send_response(200)
            self.send_header('Content-Type','application/manifest+json')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers();self.wfile.write(data);return
        if parsed.path=='/' and parse_qs(parsed.query).get('access',[''])[0]==ACCESS_KEY and ACCESS_KEY:
            self.send_response(303)
            self.send_header('Set-Cookie',f'__Host-FliteChek={ACCESS_KEY}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000')
            self.send_header('Location','/')
            self.end_headers();return
        super().do_GET()
    def do_HEAD(self):
        if not allowed(self):self.send_error(403);return
        super().do_HEAD()
    def list_directory(self,path):self.send_error(404);return None
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; connect-src 'self' https://raw.githubusercontent.com https://api.github.com; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        super().end_headers()
    def log_message(self,*args):pass

def main():
    global ACCESS_KEY
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--iphone',action='store_true',help='Enable private-link access from your iPhone over Wi-Fi.')
    args=parser.parse_args()
    bind='0.0.0.0' if args.iphone else '127.0.0.1'
    host,ip=network_identity()
    fingerprint=certificates(host,ip)
    access_file=PRIVATE/'access-key.txt'
    if not access_file.exists():access_file.write_text(secrets.token_urlsafe(32));os.chmod(access_file,0o600)
    ACCESS_KEY=access_file.read_text().strip()
    app_url=f'https://{host}:{HTTPS_PORT}/install?access={quote(ACCESS_KEY)}'
    setup_url=f'http://{ip or host}:{SETUP_PORT}/?access={quote(ACCESS_KEY)}'
    class SetupHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if not allowed(self):self.send_error(403,'Use the private setup link printed on your Mac.');return
            route=urlsplit(self.path).path
            if route=='/FliteChek-root.cer':
                data=(PRIVATE/'FliteChek-root.cer').read_bytes();mime='application/x-x509-ca-cert'
            elif route=='/':
                data=f'''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>FliteChek setup</title><body style="font:17px -apple-system,sans-serif;line-height:1.6;max-width:650px;padding:25px;margin:auto"><h1>FliteChek on your iPhone</h1><p>This setup page is served by your own Mac. Keep both devices on the same Wi-Fi. Keep your access link private.</p><p><strong>Send this setup link to your iPhone:</strong><br><a href="{html.escape(setup_url)}">{html.escape(setup_url)}</a></p><ol><li><a href="/FliteChek-root.cer?access={quote(ACCESS_KEY)}">Download this Mac’s FliteChek testing certificate</a>.</li><li>In Settings → General → VPN &amp; Device Management, install “FliteChek Local Testing”.</li><li>In Settings → General → About → Certificate Trust Settings, enable full trust for that certificate.</li><li><a href="{html.escape(app_url)}">Open FliteChek securely</a>.</li><li>Share → Add to Home Screen, then open the new icon while your Mac is running this launcher. In Menu → Setup &amp; backup, check offline readiness.</li><li>Try Airplane Mode and reopen the app.</li></ol><p>Only trust the certificate generated by your own Mac. This enables local HTTPS; nothing is uploaded. Remove the profile when you finish local testing.</p><p>Compare this fingerprint with the launcher on your Mac:</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">{html.escape(fingerprint)}</pre><p>The app uses a stable .local hostname. Different addresses have separate saved data.</p></body>'''.encode();mime='text/html; charset=utf-8'
            else:self.send_error(404);return
            self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        def log_message(self,*args):pass
    servers=[]
    started=[]
    try:
        secure=ThreadingHTTPServer((bind,HTTPS_PORT),AppHandler);servers.append(secure)
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(PRIVATE/'server.pem',PRIVATE/'server-key.pem');secure.socket=context.wrap_socket(secure.socket,server_side=True)
        setup=ThreadingHTTPServer((bind,SETUP_PORT),SetupHandler);servers.append(setup)
        preview=ThreadingHTTPServer(('127.0.0.1',8080),AppHandler);servers.append(preview)
        for server in servers:
            threading.Thread(target=server.serve_forever,daemon=True).start()
            started.append(server)
        if args.iphone:
            print(f'\nFliteChek Wi-Fi setup is running. A private access link is required on other devices.\n\nOn your iPhone, open Safari to:\n  {setup_url}\n\nApp address (after certificate setup):\n  {app_url}\n\n{fingerprint}\n',flush=True)
        else: print('\nFliteChek is running on this Mac only. Wi-Fi sharing is OFF.\n',flush=True)
        print('Preview on this Mac:\n  http://localhost:8080/\n\nKeep this window open. Press Control-C to stop.\n',flush=True)
        signal.signal(signal.SIGTERM,lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        while True:time.sleep(1)
    except KeyboardInterrupt:print('\nStopped. Installed devices with cached app files can still work offline.')
    finally:
        for server in started:server.shutdown()
        for server in servers:server.server_close()

if __name__=='__main__':
    try:main()
    except Exception as error:print(f'Could not start FliteChek: {error}');raise SystemExit(1)
