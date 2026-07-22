const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native-maps extracts a temp android source tree during install.
// Metro tries to watch it and crashes when the tmp dir is cleaned up.
// Block the pattern so Metro ignores it entirely.
const { blockList } = config.resolver;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mapsPattern = new RegExp(
  escape(require('path').join('react-native-maps', '_tmp_')) + '.*',
);

config.resolver.blockList = blockList
  ? [blockList, mapsPattern].flat()
  : [mapsPattern];

module.exports = config;
