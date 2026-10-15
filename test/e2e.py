"""Headless flow test: python3 test/e2e.py OUTDIR"""
import asyncio, os, sys, subprocess, time, json
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
PORT = 8123
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=os.path.join(ROOT, 'dist', 'pwa'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
URL = 'http://localhost:%d/' % PORT
errors = []

def watch(page, tag):
    page.on('pageerror', lambda e: errors.append('[%s] pageerror: %s' % (tag, e)))
    def con(m):
        if m.type == 'error' and 'peerjs' not in m.text.lower() and 'websocket' not in m.text.lower() and '0.peerjs' not in m.text:
            errors.append('[%s] console: %s' % (tag, m.text))
    page.on('console', con)

async def shot(page, name, full=False):
    await page.wait_for_timeout(250)
    await page.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, device_scale_factor=1)
        page = await ctx.new_page(); watch(page, 'ipad')
        await page.goto(URL)
        await page.wait_for_selector('.actions')
        await shot(page, '01-home')
        await page.click('[data-to="setup"]')
        await page.wait_for_selector('.sports')
        await page.wait_for_timeout(300)
        await shot(page, '02-setup', full=True)
        # create basketball game
        await page.click('[data-act="create"]')
        await page.wait_for_selector('.roles')
        code = await page.evaluate('window.__sb.G.game.code')
        await shot(page, '03-invite')
        await page.click('[data-role="both"]')
        await page.wait_for_selector('.scoreline')
        # second window as display, same browser
        disp = await ctx.new_page(); watch(disp, 'display')
        await disp.set_viewport_size({'width': 1280, 'height': 720})
        await disp.goto(URL + '#display-' + code)
        await disp.wait_for_selector('.bd')
        await disp.wait_for_timeout(400)
        await shot(disp, '04-display-pre')
        # play a little
        await page.click('[data-id="start"]')
        await page.click('.clk-go')
        await page.wait_for_timeout(1500)
        btn = page.locator('.pad').first.locator('.tb.xl')
        await btn.click(); await btn.click()
        await page.locator('.pad').nth(2).locator('.tb.xl').click()
        # foul with keypad on away x5 for bonus
        for i in range(5):
            await page.locator('[data-mode="foul"][data-side="away"]').click()
            await page.click('[data-kp="d"][data-v="1"]'); await page.click('[data-kp="d"][data-v="2"]')
            await page.click('[data-kp="ok"]')
        await page.wait_for_timeout(300)
        await shot(page, '05-controller')
        st = await page.evaluate('({s: window.__sb.G.R.S.score, f: window.__sb.G.R.S.fouls, out: window.__sb.G.R.S.out, run: window.__sb.G.R.S.clocks.game.run})')
        print('controller state', st)
        await disp.wait_for_timeout(500)
        dscore = await disp.evaluate('window.__sb.G.R && window.__sb.G.R.S.score')
        print('display state', dscore)
        await shot(disp, '06-display-live')
        # undo
        await page.click('[data-act="undo"]')
        await page.wait_for_timeout(200)
        print('after undo', await page.evaluate('window.__sb.G.R.S.score'))
        # log sheet
        await page.click('[data-act="log"]')
        await page.wait_for_selector('.log-row')
        await shot(page, '07-log')
        await page.keyboard.press('Escape')
        # corrections sheet
        await page.click('[data-act="menu"]')
        await page.click('[data-act="corrections"]')
        await page.wait_for_selector('.corr-row')
        await shot(page, '08-corrections')
        await page.keyboard.press('Escape')
        # end period via clock set 0 + banner
        await page.evaluate("window.__sb.dispatch('clock', {k:'game', a:'set', ms: 0})")
        await page.wait_for_timeout(300)
        await page.click('[data-act="step"][data-id="end"]')
        await page.wait_for_timeout(400)
        await shot(page, '09-break')
        await shot(disp, '10-display-break')
        # phone layout of the same controller
        await page.set_viewport_size({'width': 390, 'height': 844})
        await page.click('[data-act="step"][data-id="next"]')
        await page.wait_for_timeout(300)
        await shot(page, '11-phone-controller', full=True)
        # LED + portrait via board settings
        await page.evaluate("""(() => { const s = window.__sb; })()""")
        await b.close()

asyncio.run(main())
srv.terminate()
print('ERRORS:', len(errors))
for e in errors[:40]: print(' ', e)
