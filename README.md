# Project Name

## Overview
This project is a web application developed by Dilbek Mukhtarovich.

## Database Configuration
The application uses a database connection configured in `src/config/database.js`. Environment variables for database credentials are stored in the `.env` file.

## Getting Started

### Prerequisites
- Node.js (version X.X.X or higher)
- npm or yarn
- Database (MySQL/PostgreSQL/MongoDB)

### Installation
1. Clone the repository:
   ```
   git clone https://github.com/username/project-name.git
   cd project-name
   ```

2. Install dependencies:
   ```
   npm install
   ```
   or
   ```
   yarn install
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update the values in `.env` with your database credentials

4. Start the application:
   ```
   npm start
   ```
   or
   ```
   yarn start
   ```

## Features
1. Database-only scraping:
- Created`databaseScraper.js` that focuses solely on scraping extension data and saving it to SQLite database
- Created`cli-db.js` as a separate entry point for database-only operations
- Removed file system operations from this component
2. File system operations:
- The existing`extensionScraper.js` and`cli.js` remain for full functionality including file system operations
- These will now use the URLs stored in the database to scrape and save HTML content
The separation allows for:

- Independent operation of database and file storage tasks
- More modular and maintainable codebase
- Ability to run database scraping separately from file operations
Users can now choose between:

- Running`cli-db.js` to only scrape and store data in the database
- Running`cli.js` to perform full scraping with file system operations

## Technologies Used
- Node.js
- Express.js
- Database (MySQL/PostgreSQL/MongoDB)
- Other libraries and frameworks

## Project Structure 