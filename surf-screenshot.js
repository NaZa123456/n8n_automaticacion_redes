const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp'); 

(async () => {
  let browser;
  try {
    const outputDir = 'C:\\Users\\nazar\\.n8n-files';
    const scriptDir = 'C:\\Users\\nazar\\n8n-script'; 
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log('0. Limpiando archivos antiguos...');
    const archivos = fs.readdirSync(outputDir);
    archivos.forEach(archivo => {
      if (archivo.startsWith('surf_') && archivo.endsWith('.jpg')) {
        try { fs.unlinkSync(path.join(outputDir, archivo)); } catch (err) {}
      }
    });

    browser = await puppeteer.launch({ 
      headless: "new", 
      args: ['--window-size=1600,1200', '--force-device-scale-factor=2'] 
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 });

    console.log('1. Conectando...');
    await page.goto('https://www.surf-forecast.com/breaks/Ingleses/forecasts/latest/six_day', { 
      waitUntil: 'domcontentloaded', timeout: 0 
    });

    console.log('2. Expandiendo tabla...');
    const selectorIcono = '.fa-expand.forecast-table-days__icon';
    await page.waitForSelector(selectorIcono, { visible: true });
    await page.evaluate((sel) => {
      const buttons = document.querySelectorAll(sel);
      if (buttons.length >= 2) buttons[1].click();
      else if (buttons.length === 1) buttons[0].click();
    }, selectorIcono);

    await new Promise((resolve) => setTimeout(resolve, 8000));

    const diasSemana = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const mañanaNombre = diasSemana[(new Date().getDay() + 1) % 7]; 

    const datos = await page.evaluate((nombreDia) => {
      const fila = document.querySelector('.forecast-table__row[data-row-name="days"]');
      const celdas = Array.from(fila.querySelectorAll('.forecast-table__cell'));
      const objetivo = celdas.find(c => c.innerText.includes(nombreDia));
      if (!objetivo) return null;
      const r = objetivo.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width };
    }, mañanaNombre);

    if (datos) {
      const tabla = await page.$('#forecast-table');
      const b = await tabla.boundingBox();
      const cropHeight = b.height - (datos.y - b.y) - 240;

      const buffer = await page.screenshot({
        clip: { x: datos.x, y: datos.y, width: datos.width, height: cropHeight },
        type: 'jpeg', quality: 100 
      });

      console.log('5. Procesando Imagen con Logo...');
      const image = await Jimp.read(buffer);
      image.resize({ w: 1000 }); 

      const canvas = new Jimp({ width: 1080, height: 1920, color: 0x000000FF });

      const xCerrado = Math.floor((1080 - image.bitmap.width) / 2);
      const yCerrado = Math.floor((1920 - image.bitmap.height) / 2);
      
      canvas.composite(image, xCerrado, yCerrado);

      // --- SECCIÓN DEL LOGO (MODIFICABLE) ---
      try {
        const logoPath = path.join(scriptDir, 'SURF-INGLESES-FOTO.png');
        const logo = await Jimp.read(logoPath);
        
        // --- TAMAÑO DEL LOGO ---
        // Cambiá el 600 por un número más alto para hacerlo más grande
        logo.resize({ w: 680 }); 

        const xLogo = Math.floor((1080 - logo.bitmap.width) / 2);

        // --- POSICIÓN VERTICAL ---
        // 0.60 es el multiplicador. 
        // Si querés que BAJE: subí el número (ej: 0.61, 0.62)
        // Si querés que SUBA: bajá el número (ej: 0.59, 0.58)
        const yLogo = yCerrado + Math.floor(image.bitmap.height * 0.58); 

        canvas.composite(logo, xLogo, yLogo);
        console.log('Logo aplicado: Ajuste final de tamaño y posición.');
      } catch (e) {
        console.error('Error con el logo:', e.message);
      }

      const hoy = new Date();
      const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
      const finalPath = path.join(outputDir, `surf_${fecha}.jpg`);
      
      await canvas.write(finalPath);
      console.log(`¡LOGRADO! Archivo: surf_${fecha}.jpg`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.close();
  }
})();