#!/usr/bin/env node
// Renderiza un fichero HTML autocontenido (diseño de banner/logo/gráfico) a
// PNG o PDF, para el flujo "standalone file" del estudio de diseño de RAX
// (ver design-studio/README.md). No depende de Adobe Express: usa Chromium
// headless vía Playwright para producir el archivo final directamente.
//
// Uso:
//   node render-html.js <entrada.html> <salida.png|.pdf> [ancho] [alto] [escala] [transparent]
//
// Ejemplo:
//   node render-html.js templates/ofipapel-banner.html output/banner.png 1200 630 2
//
// El 6º argumento opcional "transparent" (solo para PNG) omite el fondo de
// página, para exportar rótulos/overlays con canal alfa que luego se
// componen sobre vídeo u otras imágenes (el HTML debe dejar el fondo
// transparente, p.ej. body { background: transparent }).
//
// Requiere Playwright + Chromium. En las sesiones en la nube de Claude Code
// ya vienen preinstalados; en local: `npm install playwright && npx playwright install chromium`
// (y quita el executablePath fijo de abajo si no existe esa ruta).

const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const [, , inputArg, outputArg, widthArg, heightArg, scaleArg, transparentArg] = process.argv;
  const transparent = transparentArg === 'transparent';

  if (!inputArg || !outputArg) {
    console.error('Uso: node render-html.js <entrada.html> <salida.png|.pdf> [ancho] [alto] [escala]');
    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);
  const outputPath = path.resolve(outputArg);
  const width = parseInt(widthArg, 10) || 1200;
  const height = parseInt(heightArg, 10) || 630;
  const scale = parseFloat(scaleArg) || 2;
  const isPdf = outputPath.toLowerCase().endsWith('.pdf');

  const launchOptions = {};
  const fs = require('fs');
  if (fs.existsSync('/opt/pw-browsers/chromium')) {
    launchOptions.executablePath = '/opt/pw-browsers/chromium';
  }

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage(
    isPdf ? {} : { viewport: { width, height }, deviceScaleFactor: scale }
  );
  await page.goto('file://' + inputPath);
  await page.waitForTimeout(500); // deja terminar de cargar web fonts (@import de Google Fonts, etc.)

  if (isPdf) {
    await page.pdf({
      path: outputPath,
      width: `${width}px`,
      height: `${height}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } else {
    await page.screenshot({ path: outputPath, omitBackground: transparent });
  }

  await browser.close();
  console.log(`Generado: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
