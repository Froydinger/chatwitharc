"""Arc browser broker; only trusted Edge Functions hold ARC_BROWSER_SECRET."""
import asyncio
import hmac
import os
import secrets
import time
from pathlib import Path

import modal

app = modal.App('arc-browser')
base = modal.Image.debian_slim(python_version='3.12').pip_install('fastapi==0.115.12','uvicorn==0.34.2','httpx==0.28.1','websockets==15.0.1')
browser_image = (base.pip_install('playwright==1.63.0')
    .run_commands('playwright install --with-deps chromium')
    .add_local_file(Path(__file__).with_name('session.py'), '/opt/arc/session.py', copy=True)
    .add_local_file(Path(__file__).with_name('view.html'), '/opt/arc/view.html', copy=True))
sessions = modal.Dict.from_name('arc-browser-sessions', create_if_missing=True)

@app.function(image=browser_image, secrets=[modal.Secret.from_name('arc-browser-service')], timeout=90, max_containers=3)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def api():
    import json
    import httpx
    from fastapi import FastAPI, Request, HTTPException
    service = FastAPI(docs_url=None, redoc_url=None)

    @service.middleware('http')
    async def auth(request, call_next):
        from fastapi.responses import JSONResponse
        if not hmac.compare_digest(request.headers.get('x-bb-api-key',''), os.environ['ARC_BROWSER_SECRET']):
            return JSONResponse({'error':'Unauthorized'}, status_code=401)
        return await call_next(request)

    async def get_record(id):
        record = await sessions.get.aio(id, None)
        if not record: raise HTTPException(404)
        return record

    @service.post('/v1/sessions')
    async def create(request: Request):
        body = await request.json()
        duration = body.get('timeout',600)
        settings = body.get('browserSettings',{})
        domains = settings.get('allowedDomains',[])
        viewport = settings.get('viewport',{})
        handle = body.get('userMetadata',{}).get('sessionHandle','')
        if not isinstance(duration,int) or not 60<=duration<=600 or not domains or len(domains)>9 or len(handle)!=36:
            raise HTTPException(400)
        secret, viewer = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        sb = None
        try:
            sb = await modal.Sandbox.create.aio(
                'bash','-c','test -f /opt/arc/session.py || { echo browser_image_missing; exit 1; }; exec python -m uvicorn session:app --app-dir /opt/arc --host 0.0.0.0 --port 8080 --no-access-log',
                app=app, image=browser_image, workdir='/opt/arc', timeout=duration,
                cpu=(0.5,1.0), memory=(1024,2048), encrypted_ports=[8080],
                env={'SESSION_SECRET':secret,'VIEW_SECRET':viewer,'ALLOWED_DOMAINS':json.dumps(domains),
                     'WIDTH':str(360 if viewport.get('width')==360 else 1365),
                     'HEIGHT':str(800 if viewport.get('width')==360 else 768)},
            )
            tunnel = (await sb.tunnels.aio())[8080].url
            async with httpx.AsyncClient(timeout=5) as client:
                for _ in range(35):
                    try:
                        response = await client.get(tunnel+'/health')
                        if response.status_code==200 and response.json().get('ready'): break
                    except httpx.HTTPError: pass
                    if await sb.poll.aio() is not None: raise RuntimeError('Browser process stopped')
                    await asyncio.sleep(.5)
                else: raise RuntimeError('Browser startup timed out')
            record = {'sandbox':sb.object_id,'url':tunnel,'admin':secret,'viewer':viewer,'created':time.time(),'expires':time.time()+duration}
            await sessions.put.aio(sb.object_id,record)
            return {'id':sb.object_id,'connectUrl':tunnel.replace('https:','wss:')+'/cdp?token='+secret}
        except Exception:
            if sb: await sb.terminate.aio()
            raise HTTPException(503,'Browser startup unavailable')

    @service.get('/v1/sessions/{id}')
    async def status(id: str):
        record = await get_record(id)
        sb = await modal.Sandbox.from_id.aio(record['sandbox'])
        ended = await sb.poll.aio() is not None
        return {'id':id,'status':'COMPLETED' if ended else 'RUNNING',
                'connectUrl':record['url'].replace('https:','wss:')+'/cdp?token='+record['admin']}

    @service.get('/v1/sessions/{id}/debug')
    async def view(id: str):
        record = await get_record(id)
        if time.time()>record['expires']: raise HTTPException(410)
        return {'debuggerFullscreenUrl':record['url']+'/view?token='+record['viewer']}

    @service.post('/v1/sessions/{id}/control')
    async def control(id: str, request: Request):
        record = await get_record(id)
        body = await request.json()
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(record['url']+'/control',headers={'x-session-secret':record['admin']},json=body)
            if response.status_code!=200: raise HTTPException(503)
        return {'ok':True}

    @service.post('/v1/sessions/{id}')
    async def close(id: str):
        record = await get_record(id)
        sb = await modal.Sandbox.from_id.aio(record['sandbox'])
        await sb.terminate.aio()
        # Retain only enough to confirm termination; erase access tokens immediately.
        await sessions.put.aio(id, {'sandbox':record['sandbox'],'url':'','admin':'','viewer':'','expires':0,'created':record['created']})
        return {'status':'COMPLETED'}

    return service
