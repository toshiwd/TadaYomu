const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { resolver } = config;

// Ensure ttf is in assetExts
if (!resolver.assetExts.includes('ttf')) {
    resolver.assetExts.push('ttf');
}

module.exports = config;
