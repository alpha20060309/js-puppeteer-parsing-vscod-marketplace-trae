

// Bu fayl endi faqat tip uchun reference bo'lib xizmat qiladi 

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Extension = sequelize.define('Extension', {
  name: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  identifier: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  version: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  author: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  downloads: {
    type: DataTypes.BIGINT,
    allowNull: true,
    defaultValue: 0
  },
  installs: {
    type: DataTypes.BIGINT,
    allowNull: true,
    defaultValue: 0
  },
  last_updated: {
    type: DataTypes.DATE,
    allowNull: true
  },
  categories: {
    type: DataTypes.TEXT, // SQLite doesn't support arrays, so we'll store as JSON string
    allowNull: true,
    get() {
      const value = this.getDataValue('categories');
      return value ? JSON.parse(value) : null;
    },
    set(value) {
      this.setDataValue('categories', value ? JSON.stringify(value) : null);
    }
  },
  rating: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  review_count: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  tags: {
    type: DataTypes.TEXT, // SQLite doesn't support arrays, so we'll store as JSON string
    allowNull: true,
    get() {
      const value = this.getDataValue('tags');
      return value ? JSON.parse(value) : null;
    },
    set(value) {
      this.setDataValue('tags', value ? JSON.stringify(value) : null);
    }
  },
  repository: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  license: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  local_path: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_created: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
});

module.exports = Extension;