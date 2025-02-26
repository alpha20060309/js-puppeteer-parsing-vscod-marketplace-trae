#!/usr/bin/env node
const ExtensionScraper = require('./scraper/extensionScraper');
const { connectDB } = require('./config/database');
const path = require('path');
const fs = require('fs').promises;
const Extension = require('./database/models/Extension');

// Get command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Error: Please specify the save location!');
  console.log('Usage: node cli-rescrape.js <save_location>');
  console.log('Example: node cli-rescrape.js C:\\VSCodeExtensions');
  process.exit(1);
}

const savePath = args[0];

const main = async () => {
  let sequelize;
  try {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../data');
    try {
      await fs.access(dataDir);
    } catch {
      console.log('Creating data directory...');
      await fs.mkdir(dataDir, { recursive: true });
    }

    // Connect to SQLite database
    console.log('Connecting to SQLite database...');
    sequelize = await connectDB();
    
    // Get database statistics
    const totalExtensions = await Extension.count();
    const savedExtensions = await Extension.count({
      where: { is_created: true }
    });
    console.log('\n=== Database Statistics ===');
    console.log(`Total extensions in database: ${totalExtensions}`);
    console.log(`Saved extensions: ${savedExtensions}`);
    console.log('========================\n');
    
    // Initialize the scraper
    console.log('Initializing VSCode Extension scraper...');
    await ExtensionScraper.initialize();

    // Get all extensions from database where is_created is false
    const extensions = await Extension.findAll({
      where: { is_created: false },
      order: [['downloads', 'DESC']] // Process most popular extensions first
    });
    console.log(`Found ${extensions.length} new entries in database.`);

    if (extensions.length === 0) {
      console.log('No new extensions to process.');
      await ExtensionScraper.close();
      if (sequelize) await sequelize.close();
      process.exit(0);
    }

    // Verify and create save directory if it doesn't exist
    const absolutePath = path.resolve(savePath);
    console.log(`Save location: ${absolutePath}`);
    
    try {
      // Create the full directory path recursively
      await fs.mkdir(absolutePath, { recursive: true });
      console.log('Directory created/verified successfully');
    } catch (err) {
      console.error('Error creating/accessing directory:', err);
      throw err;
    }

    // Process each extension with progress tracking
    let processed = 0;
    let failed = 0;
    const total = extensions.length;

    for (const extension of extensions) {
      try {
        if (extension.url) {
          const progress = Math.round((processed / total) * 100);
          console.log(`\nProgress: ${progress}% (${processed}/${total})`);
          console.log(`Processing: ${extension.name} (${extension.url})`);
          
          await ExtensionScraper.saveExtensionContent(extension.url, absolutePath);
          processed++;
        } else {
          console.log(`\nURL not found for: ${extension.name}`);
          failed++;
        }
      } catch (error) {
        console.error(`Error processing ${extension.name}:`, error);
        failed++;
      }
    }

    await ExtensionScraper.close();
    if (sequelize) await sequelize.close();

    console.log('\n=== Processing Complete ===');
    console.log(`Total extensions processed: ${processed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success rate: ${Math.round((processed / total) * 100)}%`);
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    if (ExtensionScraper) await ExtensionScraper.close();
    if (sequelize) await sequelize.close();
    process.exit(1);
  }
};

main();