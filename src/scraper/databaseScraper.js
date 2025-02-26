const puppeteer = require('puppeteer');
const Extension = require('../database/models/Extension');

class DatabaseScraper {
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
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--js-flags=--max-old-space-size=4096'
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: { width: 1920, height: 1080 }
    });
  }

  async scrapeExtensions() {
    try {
      const page = await this.browser.newPage();
      
      await page.setDefaultNavigationTimeout(120000);
      await page.setDefaultTimeout(60000);
      
      await Promise.all([
        page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
        page.setRequestInterception(true),
        page.setCacheEnabled(true)
      ]);

      // Optimize network requests by blocking unnecessary resources
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType) ||
            request.url().endsWith('.png') || request.url().endsWith('.jpg') ||
            request.url().endsWith('.gif') || request.url().endsWith('.css')) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      const sortOptions = [
        'Installs',
        'Rating',
        'PublisherCount',
        'UpdatedDate',
        'ReleaseDate',
        'Name'
      ];
      
      const processedUrls = new Set();
      let totalProcessed = 0;
      const batchSize = 20; // Increased batch size for better performance
      
      // Cache for storing checked identifiers
      const checkedIdentifiers = new Set();
      
      // Function to extract identifier from URL
      const getIdentifier = (url) => {
        const urlMatch = url.match(/itemName=([^&]+)/);
        return urlMatch ? urlMatch[1] : null;
      };
      
      // Function to check multiple identifiers in batch
      const checkExistingExtensions = async (urls) => {
        const identifiers = urls.map(getIdentifier).filter(Boolean);
        if (identifiers.length === 0) return new Set();
        
        const existingExtensions = await withRetry(async () => {
          return await Extension.findAll({
            where: { identifier: identifiers },
            attributes: ['identifier']
          });
        });
        
        return new Set(existingExtensions.map(ext => ext.identifier));
      };
      
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
        const maxScrolls = 200;
        let consecutiveEmptyScrolls = 0;
        
        const extractUrls = async () => {
          return await page.evaluate(() => {
            const selectors = [
              '.item-grid-container .row-item a',
              '.item-list-container .row-item a',
              '.gallery-item-card-container a',
              '.ux-item-card a',
              '.item-grid-container a[href*="/items"]',
              '.item-list-container a[href*="/items"]'
            ];
            
            const urls = new Set();
            
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
        
        let newUrls = await extractUrls();
        console.log(`Dastlabki URLlar soni: ${newUrls.length}`);
        
        // Process initial URLs in parallel batches
        const unprocessedInitialUrls = newUrls.filter(url => !processedUrls.has(url));
        
        // Check existing extensions in batch
        const existingIdentifiers = await checkExistingExtensions(unprocessedInitialUrls);
        
        // Filter out existing extensions
        const urlsToProcess = unprocessedInitialUrls.filter(url => {
          const identifier = getIdentifier(url);
          return identifier && !existingIdentifiers.has(identifier) && !checkedIdentifiers.has(identifier);
        });
        
        // Process new URLs in batches
        for (let i = 0; i < urlsToProcess.length; i += batchSize) {
          const batch = urlsToProcess.slice(i, i + batchSize);
          await Promise.all(batch.map(async (url) => {
            const identifier = getIdentifier(url);
            if (identifier) checkedIdentifiers.add(identifier);
            processedUrls.add(url);
            console.log(`Murojaat qilinmoqda: ${url}`);
            await this.saveExtensionToDatabase(url);
            totalProcessed++;
          }));
        }
        
        while (scrollCount < maxScrolls && consecutiveEmptyScrolls < 8) {
          scrollCount++;
          console.log(`Sahifani pastga siljitish... (${scrollCount}/${maxScrolls})`);
          
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 5);
          });
          
          await page.evaluate(() => {
            return new Promise(resolve => setTimeout(resolve, 3000)); // Reduced wait time
          });
          
          newUrls = await extractUrls();
          
          const unprocessedUrls = newUrls.filter(url => !processedUrls.has(url));
          console.log(`Yangi topilgan URLlar: ${unprocessedUrls.length}`);
          
          if (unprocessedUrls.length === 0) {
            consecutiveEmptyScrolls++;
            console.log(`Yangi URL topilmadi (${consecutiveEmptyScrolls}/8), davom etilmoqda...`);
          } else {
            consecutiveEmptyScrolls = 0;
            
            // Process URLs in parallel batches
            for (let i = 0; i < unprocessedUrls.length; i += batchSize) {
              const batch = unprocessedUrls.slice(i, i + batchSize);
              await Promise.all(batch.map(async (url) => {
                processedUrls.add(url);
                console.log(`Murojaat qilinmoqda: ${url}`);
                await this.saveExtensionToDatabase(url);
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

  async saveExtensionToDatabase(url) {
    try {
      const urlMatch = url.match(/itemName=([^&]+)/);
      const identifier = urlMatch ? urlMatch[1] : null;
      
      if (!identifier) {
        console.error(`❌ URL dan identifier ajratib olinmadi: ${url}`);
        return;
      }
      
      // Check if extension exists in database and return immediately if found
      const existingExtension = await withRetry(async () => {
        return await Extension.findOne({
          where: { identifier: identifier }
        });
      });
      
      if (existingExtension) {
        console.log(`⚠️ Extension bazada mavjud: ${existingExtension.name} (${identifier}), o'tkazib yuborilmoqda...`);
        return;
      }
      
      // Continue with scraping only for new extensions
      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0' });
      
      const extensionData = await page.evaluate((pageUrl) => {
        const getText = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : '';
        };
        
        const getNumber = (selector) => {
          const text = getText(selector);
          return text ? parseInt(text.replace(/[^0-9]/g, '')) : 0;
        };
        
        const getArray = (selector) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map(el => el.textContent.trim());
        };
        
        return {
          name: getText('h1[itemprop="name"]') || getText('.ux-item-name'),
          identifier: pageUrl.match(/itemName=([^&]+)/)[1],
          description: getText('.ux-item-shortdesc') || getText('.ux-item-description'),
          version: getText('.ux-item-meta-version') || getText('#version + td'),
          author: getText('.ux-item-publisher') || getText('#publisher + td'),
          url: pageUrl,
          downloads: getNumber('.ux-item-meta-installs') || getNumber('.installs'),
          installs: getNumber('.installs-text') || getNumber('.installs'),
          last_updated: getText('.extension-last-updated-date') || getText('#last-updated + td'),
          categories: getArray('.meta-data-list-link'),
          rating: parseFloat(getText('.ux-item-rating-count') || getText('.rating')) || 0,
          review_count: getNumber('.ux-item-rating-count'),
          tags: getArray('.meta-data-list'),
          repository: getText('.ux-repository')
        };
      }, url);
      
      await page.close();
      
      let lastUpdated = null;
      if (extensionData.last_updated) {
        try {
          lastUpdated = new Date(extensionData.last_updated);
          if (isNaN(lastUpdated.getTime())) {
            lastUpdated = null;
          }
        } catch (e) {
          lastUpdated = null;
        }
      }
      
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
        repository: extensionData.repository || null
      };
      
      if (!data.identifier) {
        console.error(`❌ Identifier is missing for extension: ${extensionData.name}`);
        return null;
      }
      
      console.log('Attempting to save to SQLite:', data.name);
      
      // Use retry mechanism for database operations
      const [extension, created] = await withRetry(async () => {
        return await Extension.findOrCreate({
          where: { identifier: data.identifier },
          defaults: data
        });
      });
      
      if (!created) {
        await withRetry(async () => {
          await extension.update(data);
        });
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

module.exports = new DatabaseScraper();