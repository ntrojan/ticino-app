// QA visiva: screenshot reali dell'app per verificare il design.
//   node qa_screenshot.mjs
import { chromium } from 'playwright'

const URL = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

console.log('→ carico', URL)
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.map canvas')
await sleep(5500) // attendo bene le tile del basemap
await page.screenshot({ path: '/tmp/shot_overview.png' })
console.log('✓ overview')

// Seleziono la stazione treno di Bellinzona (ha isocrone)
await page.fill('.search input', 'Bellinzona')
await sleep(600)
await page.locator('.stop-row[data-id="8503524:0:10000"]').first().click()
await sleep(5500) // fetch isocrone + flyTo + tile
await page.screenshot({ path: '/tmp/shot_selected.png' })
console.log('✓ selected (isocrone Bellinzona)')

// Vista mobile (responsive)
await page.setViewportSize({ width: 390, height: 844 })
await sleep(2500)
await page.screenshot({ path: '/tmp/shot_mobile.png' })
console.log('✓ mobile')

await browser.close()
console.log('DONE')
