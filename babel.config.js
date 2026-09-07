module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must stay last so worklets/reanimated transform after other plugins.
      'react-native-reanimated/plugin',
    ],
  };
};
