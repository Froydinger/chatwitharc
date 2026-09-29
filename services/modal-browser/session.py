"""Ephemeral Chromium session. No Modal/Supabase/model credentials enter this process."""
import asyncio
import contextlib
import ipaddress
import json
import os
import secrets
import socket
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import websockets
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.responses import HTMLResponse
from playwright.async_api import async_playwright

ADMIN = os.environ['SESSION_SECRET']
VIEW = os.environ['VIEW_SECRET']
DOMAINS = set(json.loads(os.environ['ALLOWED_DOMAINS']))
WIDTH, HEIGHT = int(os.environ['WIDTH']), int(os.environ['HEIGHT'])
control = 'agent'
page = None
browser = None
lock = asyncio.Lock()

async def copy_stream(reader, writer):
    try:
        while chunk := await reader.read(65536):
            writer.write(chunk)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()

async def public_proxy(reader, writer):
    """Pin CONNECT to a checked public IP, including redirects and subresources."""
    try:
        raw = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 10)
        method, target, _ = raw.split(b'\r\n', 1)[0].decode().split(' ', 2)
        if method != 'CONNECT':
            raise ValueError('HTTPS required')
        host, port = target.rsplit(':', 1)
        host = host.strip('[]')
        if port != '443':
            raise ValueError('HTTPS required')
        addresses = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError('Private address')
        remote_reader, remote_writer = await asyncio.wait_for(asyncio.open_connection(addresses[0][4][0], 443), 10)
        writer.write(b'HTTP/1.1 200 Connection Established\r\n\r\n')
        await writer.drain()
        tasks = [asyncio.create_task(copy_stream(reader, remote_writer)), asyncio.create_task(copy_stream(remote_reader, writer))]
        _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    except Exception:
        writer.close()

@asynccontextmanager
async def lifespan(app):
    global browser, page
    proxy = await asyncio.start_server(public_proxy, '127.0.0.1', 8888, limit=16384)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, proxy={'server':'http://127.0.0.1:8888'}, args=[
            '--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1',
            '--proxy-bypass-list=<-loopback>', '--disable-quic', '--disable-dev-shm-usage',
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        ])
        context = await browser.new_context(viewport={'width':WIDTH,'height':HEIGHT}, accept_downloads=False, service_workers='block')
        async def route(request_route):
            from urllib.parse import urlsplit
            request = request_route.request
            url = urlsplit(request.url)
            # Keep top-level navigation scoped to domains authorized by Arc.
            if url.scheme != 'https':
                await request_route.abort()
            else:
                await request_route.continue_()
        await context.route('**/*', route)
        page = await context.new_page()
        page.on('dialog', lambda dialog: asyncio.create_task(dialog.dismiss()))
        async def close_popup(popup):
            await popup.close()
        context.on('page', lambda popup: asyncio.create_task(close_popup(popup)) if popup != page else None)
        yield
        with contextlib.suppress(Exception):
            await browser.close()
    proxy.close()
    await proxy.wait_closed()

app = FastAPI(lifespan=lifespan)

def authorized(value, expected):
    return bool(value) and secrets.compare_digest(value, expected)

@app.get('/health')
async def health(): return {'ready': page is not None}

@app.post('/control')
async def set_control(request: Request):
    global control
    if not authorized(request.headers.get('x-session-secret'), ADMIN): raise HTTPException(401)
    body = await request.json()
    if body.get('control') not in ('agent','user'): raise HTTPException(400)
    async with lock:
        control = body['control']
    return {'ok':True}

@app.websocket('/cdp')
async def cdp(ws: WebSocket):
    if not authorized(ws.query_params.get('token'), ADMIN):
        await ws.close(code=1008); return
    await ws.accept()
    async with httpx.AsyncClient() as client:
        info = (await client.get('http://127.0.0.1:9222/json/version')).json()
    async with websockets.connect(info['webSocketDebuggerUrl'], max_size=8*1024*1024) as chrome:
        async def incoming():
            while True:
                message = await ws.receive_text()
                if control != 'agent':
                    payload = json.loads(message)
                    await ws.send_json({'id':payload.get('id'), 'error':{'code':-32000,'message':'User has control'}})
                    continue
                await chrome.send(message)
        async def outgoing():
            async for message in chrome: await ws.send_text(message)
        tasks = [asyncio.create_task(incoming()), asyncio.create_task(outgoing())]
        _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

@app.get('/view')
async def view(request: Request):
    if not authorized(request.query_params.get('token'), VIEW): raise HTTPException(401)
    return HTMLResponse(Path('/opt/arc/view.html').read_text(), headers={
        'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'self'; frame-ancestors https://askarc.chat https://www.askarc.chat http://localhost:*; base-uri 'none'; form-action 'none'",
    })

@app.websocket('/screen')
async def screen(ws: WebSocket):
    if not authorized(ws.query_params.get('token'), VIEW):
        await ws.close(code=1008); return
    await ws.accept()
    async def frames():
        while True:
            await ws.send_json({'url':page.url,'control':control,'width':WIDTH,'height':HEIGHT})
            await ws.send_bytes(await page.screenshot(type='jpeg', quality=65, timeout=5000))
            await asyncio.sleep(.35)
    async def inputs():
        while True:
            data = await ws.receive_json()
            async with lock:
                if control != 'user': continue
                kind = data.get('type')
                if kind == 'click':
                    await page.mouse.click(max(0,min(WIDTH,float(data['x']))), max(0,min(HEIGHT,float(data['y']))))
                elif kind == 'scroll':
                    await page.mouse.wheel(max(-2000,min(2000,float(data.get('x',0)))), max(-2000,min(2000,float(data.get('y',0)))))
                elif kind == 'text': await page.keyboard.insert_text(str(data.get('text',''))[:2000])
                elif kind == 'key' and data.get('key') in ('Enter','Tab','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Control+A','Meta+A'):
                    await page.keyboard.press(data['key'])
                elif kind == 'back': await page.go_back(wait_until='domcontentloaded', timeout=10000)
                elif kind == 'forward': await page.go_forward(wait_until='domcontentloaded', timeout=10000)
                elif kind == 'reload': await page.reload(wait_until='domcontentloaded', timeout=10000)
                elif kind == 'goto':
                    from urllib.parse import urlsplit
                    url = str(data.get('url',''))[:2048]
                    if urlsplit(url).scheme == 'https' and not urlsplit(url).username and not urlsplit(url).password:
                        await page.goto(url, wait_until='domcontentloaded', timeout=15000)
    tasks = [asyncio.create_task(frames()), asyncio.create_task(inputs())]
    _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending: task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
