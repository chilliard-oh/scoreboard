"""Phone-size screens: python3 test/phone.py OUTDIR"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8126'], cwd=os.path.join(ROOT, 'dist', 'pwa'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors = []
U = 'http://localhost:8126/'
async def newgame(page, sport, role='both'):
    await page.goto(U); await page.wait_for_timeout(400)
    if await page.locator('[data-act="leave"]').count():
        await page.locator('[data-act="leave"]').first.click()
    await page.wait_for_selector('.actions')
    await page.click('[data-to="setup"]')
    await page.click('[data-act="dSport"][data-id="%s"]' % sport)
    await page.click('[data-act="create"]')
    await page.click('[data-role="%s"]' % role)
    await page.wait_for_timeout(300)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror %s' % e))
        page.on('console', lambda m: errors.append('console %s' % m.text) if m.type == 'error' and 'peerjs' not in m.text.lower() else None)
        await page.goto(U); await page.wait_for_selector('.actions')
        await page.screenshot(path=OUT + '/p01-home.png')
        await page.click('[data-to="setup"]'); await page.wait_for_timeout(300)
        await page.screenshot(path=OUT + '/p02-setup.png', full_page=True)
        await page.click('[data-act="pickTeam"][data-side="home"]'); await page.wait_for_timeout(200)
        await page.click('[data-act="quickTeam"]'); await page.wait_for_timeout(200)
        await page.fill('#te-name', 'Squamish Summit'); await page.fill('#te-short', 'SQS')
        await page.fill('#te-c1h', '#5b2a86'); await page.dispatch_event('#te-c1h', 'input')
        await page.screenshot(path=OUT + '/p03-team-editor.png')
        await page.click('[data-te="save"]'); await page.wait_for_timeout(200)
        await page.screenshot(path=OUT + '/p04-setup-after-team.png')
        # volleyball controller
        await newgame(page, 'volleyball')
        for i in range(5): await page.locator('.pad').first.locator('.tb.xl').click()
        await page.locator('.pad').nth(2).locator('.tb.xl').click()
        await page.wait_for_timeout(200)
        await page.screenshot(path=OUT + '/p05-volleyball.png')
        # baseball controller
        await newgame(page, 'baseball')
        await page.click('[data-t="pitch"][data-p*="ball"]'); await page.click('[data-t="pitch"][data-p*="strike"]')
        await page.wait_for_timeout(200)
        await page.evaluate('window.scrollTo(0, 260)')
        await page.screenshot(path=OUT + '/p06-baseball.png')
        # hockey + penalty keypad
        await newgame(page, 'hockey')
        await page.click('[data-mode="penalty"][data-side="away"]'); await page.wait_for_timeout(150)
        await page.click('[data-kp="d"][data-v="1"]'); await page.click('[data-kp="d"][data-v="7"]')
        await page.screenshot(path=OUT + '/p07-penalty.png')
        await page.click('[data-kp="ok"]'); await page.wait_for_timeout(200)
        await page.evaluate('window.scrollTo(0, 420)')
        await page.screenshot(path=OUT + '/p08-hockey.png')
        # join screen
        await page.locator('[data-act="leave"]').first.click(); await page.wait_for_timeout(200)
        await page.goto(U + '#join-ABC234'); await page.reload(); await page.wait_for_timeout(400)
        await page.screenshot(path=OUT + '/p09-join.png')
        # soccer shootout on iPad
        await page.set_viewport_size({'width': 1024, 'height': 768})
        await newgame(page, 'soccer')
        await page.evaluate("(() => { const d = window.__sb.dispatch; d('start'); d('endp'); d('nextp'); d('endp'); d('nextp'); d('endp'); d('nextp'); d('endp'); })()")
        await page.wait_for_timeout(200)
        await page.screenshot(path=OUT + '/p10-soccer-tie.png')
        await page.click('[data-act="step"][data-id="so"]'); await page.click('[data-act="soFirst"][data-side="home"]')
        await page.click('[data-t="kick"][data-p*="home"][data-p*="true"]'); await page.click('[data-t="kick"][data-p*="away"][data-p*="false"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path=OUT + '/p11-shootout.png')
        await b.close()
asyncio.run(main()); srv.terminate()
print('ERRORS', len(errors)); [print(' ', e) for e in errors[:20]]
