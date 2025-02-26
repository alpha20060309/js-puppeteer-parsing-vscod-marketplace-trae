const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class ExtensionScraper {
  async initialize() {
    this.browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-networking',
        '--disable-ipc-flooding-protection',
        '--enable-features=NetworkService,NetworkServiceInProcess'
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: { width: 1920, height: 1080 }
    });
  }

  async scrapeExtensions(savePath) {
    try {
      const page = await this.browser.newPage();
      
      await page.setDefaultNavigationTimeout(120000);
      await page.setDefaultTimeout(60000);
      
      await Promise.all([
        page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
        page.setRequestInterception(true),
        page.setCacheEnabled(true)
      ]);

      page.on('request', (request) => {
        if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      // Turli xil saralash usullari bilan qidirish
      const sortOptions = [
        'Installs', // Eng ko'p o'rnatilgan
        'Rating', // Eng yuqori baholangan
        'PublisherCount', // Eng ko'p nashriyotchilar
        'UpdatedDate', // Eng so'nggi yangilangan
        'ReleaseDate', // Eng so'nggi chiqarilgan
        'Name' // Alifbo tartibida
      ];
      
      const processedUrls = new Set();
      let totalProcessed = 0;
      const batchSize = 5; // Number of concurrent URL processing
      
      // Har bir saralash usuli bilan qidirish
      for (const sortOption of sortOptions) {
        console.log(`\n=== ${sortOption} bo'yicha qidirilmoqda ===\n`);
        
        const url = `https://marketplace.visualstudio.com/search?target=VSCode&category=All%20categories&sortBy=${sortOption}`;
        console.log(`VSCode Marketplace sahifasiga o'tilmoqda: ${url}`);
        
        await page.goto(url, {
          waitUntil: 'networkidle0'
        });
        
        console.log('Sahifa elementlari yuklanishini kutish...');
        await page.waitForSelector('.item-list-container', { timeout: 80000 });
        
        let scrollCount = 0;
        const maxScrolls = 200; // 100 dan 200 ga oshiramiz
        let consecutiveEmptyScrolls = 0;
        
        // Function to extract URLs from the current page view
        const extractUrls = async () => {
          return await page.evaluate(() => {
            // Try multiple selectors to find all possible extensions
            const selectors = [
              '.item-grid-container .row-item a',
              '.item-list-container .row-item a',
              '.gallery-item-card-container a',
              '.ux-item-card a',
              '.item-grid-container a[href*="/items"]',
              '.item-list-container a[href*="/items"]'
            ];
            
            const urls = new Set();
            
            // Try each selector and collect unique URLs
            for (const selector of selectors) {
              const elements = document.querySelectorAll(selector);
              for (const element of elements) {
                if (element.href && element.href.includes('/items?itemName=')) {
                  urls.add(element.href);
                }
              }
            }
            
            return Array.from(urls);
          });
        };
        
        // Initial extraction before scrolling
        let newUrls = await extractUrls();
        console.log(`Dastlabki URLlar soni: ${newUrls.length}`);
        
        // Process initial batch of URLs
        for (const url of newUrls) {
          if (!processedUrls.has(url)) {
            processedUrls.add(url);
            console.log(`Murojaat qilinmoqda: ${url}`);
            await this.saveExtensionContent(url, savePath);
            totalProcessed++;
          }
        }
        
        // Continue scrolling and processing until termination conditions are met
        while (scrollCount < maxScrolls && consecutiveEmptyScrolls < 8) { // 5 dan 8 ga oshiramiz
          scrollCount++;
          console.log(`Sahifani pastga siljitish... (${scrollCount}/${maxScrolls})`);
          
          // Scroll down once
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 5);
          });
          
          // Wait for new content to load
          await page.evaluate(() => {
            return new Promise(resolve => setTimeout(resolve, 5000));
          });
          
          // Extract new URLs after scrolling
          newUrls = await extractUrls();
          
          // Filter out already processed URLs
          const unprocessedUrls = newUrls.filter(url => !processedUrls.has(url));
          console.log(`Yangi topilgan URLlar: ${unprocessedUrls.length}`);
          
          // If no new URLs found, increment empty scroll counter
          if (unprocessedUrls.length === 0) {
            consecutiveEmptyScrolls++;
            console.log(`Yangi URL topilmadi (${consecutiveEmptyScrolls}/8), davom etilmoqda...`);
          } else {
            // Reset empty scroll counter if new URLs found
            consecutiveEmptyScrolls = 0;
            
            // Process URLs in parallel batches
            for (let i = 0; i < unprocessedUrls.length; i += batchSize) {
              const batch = unprocessedUrls.slice(i, i + batchSize);
              await Promise.all(batch.map(async (url) => {
                processedUrls.add(url);
                console.log(`Murojaat qilinmoqda: ${url}`);
                await this.saveExtensionContent(url, savePath);
                totalProcessed++;
              }));
            }
            
            console.log(`Jami qayta ishlangan URLlar: ${totalProcessed}`);
          }
        }
        
        if (consecutiveEmptyScrolls >= 8) {
          console.log(`Ketma-ket 8 marta yangi URL topilmadi, keyingi saralash usuliga o'tilmoqda...`);
        } else if (scrollCount >= maxScrolls) {
          console.log(`Maksimal scroll miqdoriga yetildi, keyingi saralash usuliga o'tilmoqda...`);
        }
      }
      
      console.log(`\n=== YAKUNIY NATIJA ===`);
      console.log(`Jami topilgan va qayta ishlangan URLlar: ${totalProcessed}`);
      return totalProcessed;
    } catch (error) {
      console.error('Scraping xatosi:', error);
      throw error;
    }
  }
  async saveExtensionContent(url, savePath) {
    try {
      // Extract identifier from URL
      const urlMatch = url.match(/itemName=([^&]+)/);
      const identifier = urlMatch ? urlMatch[1] : null;
      
      if (!identifier) {
        console.error(`❌ URL dan identifier ajratib olinmadi: ${url}`);
        return;
      }
      
      // Check if extension already exists in database
      const Extension = require('../database/models/Extension');
      const existingExtension = await Extension.findOne({
        where: { identifier: identifier }
      });
      
      if (existingExtension) {
        console.log(`⚠️ Extension bazada mavjud: ${existingExtension.name} (${identifier})`);
      }
      
      // Continue with scraping
      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0' });
      
      // Extract all necessary data from the page
      const extensionData = await page.evaluate((pageUrl) => {
        const getText = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : '';
        };
        
        return {
          name: getText('h1[itemprop="name"]') || getText('.ux-item-name'),
          identifier: pageUrl.match(/itemName=([^&]+)/)[1],
          url: pageUrl
        };
      }, url);
      
      // Get the full HTML content
      const htmlContent = await page.evaluate(() => document.documentElement.outerHTML);
      await page.close();
      
      // Create folder name based on extension name with regex sanitization
      const folderName = extensionData.name
        .replace(/\//g, ' ')  // Replace forward slashes with spaces
        .replace(/[\\:*?"<>|]/g, '_');  // Replace other problematic characters with underscores
      const folderPath = path.join(savePath, folderName);
      
      // Create folder if it doesn't exist
      await fs.mkdir(folderPath, { recursive: true });
      
      // Save HTML content
      const htmlFilePath = path.join(folderPath, 'content.html');
      await fs.writeFile(htmlFilePath, htmlContent, 'utf8');
      console.log(`✅ HTML fayl saqlandi: ${htmlFilePath}`);
      
      // Create and save URL shortcut file
      const urlFilePath = path.join(folderPath, `${folderName}.url`);
      await fs.writeFile(urlFilePath, `[InternetShortcut]\nURL=${url}\n`, 'utf8');
      console.log(`🔗 URL fayl saqlandi: ${urlFilePath}`);
      
      // Update database record
      if (existingExtension) {
        await existingExtension.update({
          local_path: folderPath,
          is_created: true
        });
      }
      
      console.log(`✅ Extension muvaffaqiyatli saqlandi: ${extensionData.name}`);
      return true;
    } catch (error) {
      console.error(`❌ Extension saqlashda xatolik: ${url}`, error);
      return false;
    }
  }
  async saveToDatabase(extensionData, localPath) {
    try {
      const Extension = require('../database/models/Extension');
      
      // Convert last_updated string to timestamp if possible
      let lastUpdated = null;
      if (extensionData.last_updated) {
        try {
          lastUpdated = new Date(extensionData.last_updated);
          if (isNaN(lastUpdated.getTime())) {
            lastUpdated = null; // Set to null if parsing fails
          }
        } catch (e) {
          lastUpdated = null;
        }
      }
      
      // Prepare data for SQLite
      const data = {
        name: extensionData.name || null,
        identifier: extensionData.identifier || null,
        description: extensionData.description || null,
        version: extensionData.version || null,
        author: extensionData.author || null,
        url: extensionData.url || null,
        downloads: extensionData.downloads || null,
        installs: extensionData.installs || null,
        last_updated: lastUpdated,
        categories: extensionData.categories && extensionData.categories.length > 0 ? extensionData.categories : null,
        rating: extensionData.rating || null,
        review_count: extensionData.review_count || null,
        tags: extensionData.tags && extensionData.tags.length > 0 ? extensionData.tags : null,
        repository: extensionData.repository || null,
        license: extensionData.license || null,
        local_path: localPath || null,
        is_created: true
      };
      
      // Ensure identifier is not null (required field)
      if (!data.identifier) {
        console.error(`❌ Identifier is missing for extension: ${extensionData.name}`);
        return null;
      }
      
      console.log('Attempting to save to SQLite:', data.name);
      
      // Insert or update data in SQLite
      const [extension, created] = await Extension.findOrCreate({
        where: { identifier: data.identifier },
        defaults: data
      });
      
      // If the record already exists, update it
      if (!created) {
        await extension.update(data);
      }
      
      console.log(`✅ ${extensionData.name} ma'lumotlari SQLite bazasiga saqlandi`);
      return extension;
    } catch (error) {
      console.error(`❌ SQLite bazasiga saqlashda xatolik:`, error);
      console.error('Error stack:', error?.stack);
      return null;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = new ExtensionScraper();
