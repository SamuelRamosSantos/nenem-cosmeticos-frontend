const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Habilita resolução via campo "exports" do package.json (necessário para
// pacotes ESM-only como @react-navigation/core v7.17+)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
