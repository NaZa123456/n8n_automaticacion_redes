const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const getFormattedDate = () => {
  const now = new Date();
  return now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0].slice(0, 16);
};

(async () => {
  let browser;
  try {
    const outputDir = 'C:\\Users\\nazar\\.n8n-files';
    const bravePath = 'C:\\Users\\nazar\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
    const userData = 'C:\\Users\\nazar\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data';
    const logoPath = 'C:\\Users\\nazar\\n8n-script\\SURF-INGLESES.png'; 
    const musicPath = 'C:\\Users\\nazar\\n8n-script\\cancion.webm'; 

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    } else {
      console.log('Limpiando archivos antiguos...');
      const files = fs.readdirSync(outputDir);
      for (const file of files) {
        if (file.startsWith('surf_reel_') || file.startsWith('temp_horiz_')) {
          try { fs.unlinkSync(path.join(outputDir, file)); } catch (e) {}
        }
      }
    }

    const dateStr = getFormattedDate();
    const tempVideoPath = path.join(outputDir, `temp_horiz_${dateStr}.mp4`);
    const finalVideoPath = path.join(outputDir, `surf_reel_${dateStr}.mp4`);

    if (!fs.existsSync(logoPath)) {
        console.error(`\n❌ ERROR: No se encontró el logo en: ${logoPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(musicPath)) {
        console.warn(`\n⚠️ AVISO: No se encontró la música en: ${musicPath}. El video no tendrá audio.`);
    }

    console.log('1. Iniciando Brave...');
    browser = await puppeteer.launch({
      headless: "new", // "new" es más eficiente para servidores
      executablePath: bravePath,
      userDataDir: userData,
      args: ['--start-fullscreen', '--no-sandbox', '--profile-directory=Default', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const recorder = new PuppeteerScreenRecorder(page, {
      fps: 30,
      videoFrame: { width: 1920, height: 1080 },
      aspectRatio: '16:9',
    });

    console.log('2. Navegando a Ingleses...');
    try {
        await page.goto('https://surfview.com.br/praia/ingleses', { 
            waitUntil: 'networkidle2', 
            timeout: 120000 
        });
    } catch (e) {
        console.log('⚠️ Aviso: Tiempo de carga excedido, procediendo...');
    }

    console.log('3. Esperando reproductor...');
    await page.waitForSelector('.vjs-tech', { timeout: 40000 }).catch(() => {});
    
    // Espera para que el streaming cargue bien
    await new Promise(r => setTimeout(r, 30000)); 

    console.log(`4. Grabando 30 segundos: ${dateStr}`);
    await recorder.start(tempVideoPath);
    await new Promise(r => setTimeout(r, 30000)); 
    await recorder.stop();

    await browser.close();

    console.log('5. Procesando FFmpeg (Vertical + Logo + Audio 59s)...');
    
    const command = ffmpeg(tempVideoPath)
      .input(logoPath)
      .input(musicPath)
      .complexFilter([
        // -- VIDEO --
        { filter: 'scale', options: { w: 1920, h: 1080 }, inputs: '0:v', outputs: 'v_scaled' },
        { 
          filter: 'drawbox', 
          options: { 
            x: 0, y: 665, w: 'iw', h: 'ih-665', 
            color: '0x1c1c1c', t: 'fill' 
          }, 
          inputs: 'v_scaled', outputs: 'v_bar' 
        },
        { filter: 'crop', options: { w: 1920, h: 1000, x: 0, y: 80 }, inputs: 'v_bar', outputs: 'v_cropped' },
        { filter: 'crop', options: { w: 562, h: 1000, x: '((iw-ow)/2)+22', y: 0 }, inputs: 'v_cropped', outputs: 'vid_vertical' },

        // -- LOGO --
        { filter: 'scale', options: { w: -1, h: 90 }, inputs: '1:v', outputs: 'logo_scaled' },
        { 
          filter: 'overlay', 
          options: { 
            x: '(main_w-overlay_w)/2', 
            y: 605,
            format: 'auto'
          }, 
          inputs: ['vid_vertical', 'logo_scaled'], outputs: 'v_processed' 
        },

        // -- AUDIO (Limitado a 59s para Stories/Reels) --
        { filter: 'atrim', options: { start: 20, duration: 59 }, inputs: '2:a', outputs: 'a_trimmed' },
        { filter: 'asetpts', options: 'PTS-STARTPTS', inputs: 'a_trimmed', outputs: 'a_synced' },
        { filter: 'volume', options: '0.5', inputs: 'a_synced', outputs: 'a_final' }
      ]);

    await new Promise((resolve, reject) => {
      command
        .outputOptions([
          '-map [v_processed]', 
          '-map [a_final]', 
          '-c:v libx264', 
          '-pix_fmt yuv420p', 
          '-b:v 4M',
          '-c:a aac', 
          '-t 59',                 // <--- Límite estricto de 59 segundos para la API
          '-shortest',             // Corta si el video es menor a 59s
          '-movflags +faststart' 
        ])
        .output(finalVideoPath)
        .on('end', () => {
          if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
          console.log('¡PROCESO COMPLETADO! Video listo en: ' + finalVideoPath);
          resolve();
        })
        .on('error', (err) => {
          console.error('Error en FFmpeg:', err.message);
          reject(err);
        })
        .run();
    });

  } catch (err) {
    console.error('Error general:', err);
    if (browser) await browser.close();
  }
})();