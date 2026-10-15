"""Render each sport on a different screen shape: python3 test/gallery.py OUTDIR"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8125'], cwd=os.path.join(ROOT, 'dist', 'pwa'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors = []
CASES = [
  ('basketball', '16:9', {'style': 'led'}, """
    d('clock',{k:'game',a:'start'}); d('score',{side:'home',pts:3}); d('score',{side:'away',pts:2});
    for (let i=0;i<5;i++) d('foul',{side:'away'}); d('arrow',{side:'home'}); d('timeout',{side:'away',kind:'short'}); d('foul',{side:'home',player:'23'}); """),
  ('volleyball', '9:16', {}, """
    for (let i=0;i<25;i++){ d('score',{side:'home'}); if(i<20) d('score',{side:'away'}); }
    d('nextp'); for (let i=0;i<14;i++){ d('score',{side:'away'}); if(i<12) d('score',{side:'home'}); } d('timeout',{side:'home'}); """),
  ('soccer', '16:9', {'mode': 'light', 'bg': 'solid'}, """
    d('clock',{k:'game',a:'start'}); d('score',{side:'home'}); d('card',{side:'away',color:'Y',player:'4'}); d('card',{side:'away',color:'Y',player:'4'}); d('stoppage',{min:3}); d('stat',{side:'home',k:'shots',d:1}); """),
  ('football', '21:9', {}, """
    d('poss',{side:'home'}); d('score',{side:'home',kind:'td'}); d('score',{side:'home',kind:'pat'}); d('score',{side:'away',kind:'fg'}); d('down',{down:3,dist:7}); d('ball',{side:'away',yd:34}); d('flag',{on:true}); d('clock',{k:'play',a:'set',ms:25000,run:true}); """),
  ('hockey', 'ribbon', {}, """
    d('clock',{k:'game',a:'start'}); d('penalty',{side:'away',kind:'minor',player:'17'}); d('stat',{side:'home',k:'sog',d:1}); d('score',{side:'away'}); """),
  ('hockey', '16:9', {'font': 'oswald'}, """
    d('clock',{k:'game',a:'start'}); d('penalty',{side:'away',kind:'minor',player:'17'}); d('penalty',{side:'home',kind:'major',player:'4'}); d('stat',{side:'home',k:'sog',d:1}); d('score',{side:'away'}); """),
  ('baseball', '16:9', {}, """
    for (const r of ['ball','strike','ball']) d('pitch',{r}); d('hit'); d('base',{b:0,on:true}); d('score',{}); d('out'); d('out'); d('out');
    d('pitcher',{side:'away',num:'31'}); d('score',{}); d('score',{}); d('pitch',{r:'ball'}); d('base',{b:1,on:true}); d('out'); """),
  ('baseball', '9:16', {}, """
    for (const r of ['ball','strike','ball']) d('pitch',{r}); d('hit'); d('score',{}); d('out'); d('out'); d('out'); d('score',{}); d('base',{b:2,on:true}); """),
  ('baseball', 'ribbon', {}, """
    d('pitch',{r:'ball'}); d('pitch',{r:'strike'}); d('out'); d('base',{b:0,on:true}); d('score',{}); """),
  ('football', '4:3', {'style': 'led', 'font': 'saira'}, """
    d('poss',{side:'away'}); d('score',{side:'away',kind:'td'}); d('down',{down:2,dist:4}); d('clock',{k:'game',a:'start'}); """),
  ('basketball', 'ribbon', {}, """
    d('clock',{k:'game',a:'start'}); d('score',{side:'home',pts:2}); for (let i=0;i<7;i++) d('foul',{side:'home'}); """),
  ('soccer', '9:16', {'style':'led'}, """
    d('start'); d('endp'); d('nextp'); d('endp'); d('so',{first:'home'}); d('kick',{side:'home',made:true}); d('kick',{side:'away',made:false}); d('kick',{side:'home',made:true}); """),
]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for i, (sport, aspect, disp, script) in enumerate(CASES):
            ctx = await b.new_context(viewport={'width': 1280, 'height': 720})
            page = await ctx.new_page()
            page.on('pageerror', lambda e, i=i: errors.append('%d pageerror %s' % (i, e)))
            page.on('console', lambda m, i=i: errors.append('%d console %s' % (i, m.text)) if m.type == 'error' and 'peerjs' not in m.text.lower() else None)
            await page.goto('http://localhost:8125/')
            await page.click('[data-to="setup"]')
            await page.click('[data-act="dSport"][data-id="%s"]' % sport)
            await page.click('[data-act="dAspect"][data-id="%s"]' % aspect)
            for k, v in disp.items():
                if k == 'font':
                    await page.select_option('#d-font', v)
                else:
                    await page.click('[data-act="dDisp"][data-k="%s"][data-v="%s"]' % (k, v))
            await page.click('[data-act="create"]')
            await page.click('[data-role="display"]')
            await page.wait_for_selector('.bd')
            await page.evaluate("(() => { const d = (t,p) => window.__sb.dispatch(t,p); " + script + " })()")
            await page.wait_for_timeout(1800)
            await page.mouse.move(1, 1)
            await page.screenshot(path=os.path.join(OUT, 'g%02d-%s-%s.png' % (i, sport, aspect.replace(':', 'x'))))
            await ctx.close()
        await b.close()
asyncio.run(main()); srv.terminate()
print('ERRORS', len(errors)); [print(' ', e) for e in errors[:30]]
