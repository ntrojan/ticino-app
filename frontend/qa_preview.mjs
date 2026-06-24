// Verifica la build di DEPLOY (vite preview, file isocrone combinati).
import { chromium } from 'playwright'
const URL = process.env.URL || 'http://localhost:4173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.map canvas')
await sleep(3000)
await page.fill('.search input', 'Bellinzona')
await sleep(600)
await page.locator('.stop-row[data-id="8503524:0:10000"]').first().click()
await sleep(5000)
await page.screenshot({ path: '/tmp/shot_deploy.png' })
console.log('✓ deploy preview screenshot')
await browser.close()
