#!/usr/bin/env node
const DatabaseScraper = require('./scraper/databaseScraper');
const { connectDB } = require('./config/database');
const path = require('path');
const fs = require('fs').promises;
const Extension = require('./database/models/Extension');
const { Sequelize } = require('sequelize');

// Enhanced retry configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 500; // Reduced to 500ms for faster retries
const BATCH_SIZE = 50; // Increased batch size for database operations

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced retry wrapper for database operations with exponential backoff
global.withRetry = async function withRetry(operation, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      const isRetryableError = 
        error.name === 'SequelizeTimeoutError' || 
        (error.original && error.original.code === 'SQLITE_BUSY') ||
        error.name === 'SequelizeConnectionError';

      if (!isRetryableError) throw error; // If not a retryable error, throw immediately
      
      if (i === retries - 1) throw error; // If last retry, throw error
      
      const delay = RETRY_DELAY * Math.pow(2, i); // Exponential backoff
      console.log(`Database operation failed, retrying in ${delay}ms... (${i + 1}/${retries})`);
      await wait(delay);
    }
  }
};

const main = async () => {
  let sequelize;
  try {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../data');
    try {
      await fs.access(dataDir);
    } catch {
      console.log('Data papkasi mavjud emas. Yaratilmoqda...');
      await fs.mkdir(dataDir, { recursive: true });
    }

    // Connect to SQLite database with optimized settings
    console.log('SQLite bazasiga ulanish...');
    sequelize = await connectDB();
    
    // Configure connection pool
    sequelize.config.pool = {
      max: 25, // Increased max connections
      min: 5,  // Minimum connections
      acquire: 60000, // Increased timeout
      idle: 10000
    };
    
    console.log('SQLite bazasiga muvaffaqiyatli ulandi');
    
    // Force sync the model with retry mechanism
    console.log('Database jadvallarini yaratish...');
    await withRetry(async () => {
      await Extension.sync({ alter: true });
    });
    console.log('Database jadvallar sinxronlashtirildi');
    
    console.log('VSCode Extension scraping boshlandi (faqat baza uchun)...');
    await DatabaseScraper.initialize();
    
    // Process extensions in batches
    const processExtensionsInBatches = async () => {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const extensions = await Extension.findAll({
          limit: BATCH_SIZE,
          offset,
          order: [['downloads', 'DESC']]
        });

        if (extensions.length === 0) {
          hasMore = false;
          continue;
        }

        await Promise.all(
          extensions.map(extension =>
            withRetry(() => extension.save())
          )
        );

        offset += BATCH_SIZE;
        console.log(`Processed ${offset} extensions...`);
      }
    };

    await DatabaseScraper.scrapeExtensions();
    await processExtensionsInBatches();
    
    await DatabaseScraper.close();
    if (sequelize) {
      await sequelize.connectionManager.close();
      await sequelize.close();
    }
    console.log('Scraping muvaffaqiyatli yakunlandi!');
    process.exit(0);
  } catch (error) {
    console.error('Xatolik yuz berdi:', error);
    if (DatabaseScraper) await DatabaseScraper.close();
    if (sequelize) {
      await sequelize.connectionManager.close();
      await sequelize.close();
    }
    process.exit(1);
  }
};

main();