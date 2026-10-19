module.exports = ({ config }) => ({
  ...config,
  plugins: [...(config.plugins || []), 'expo-secure-store'],
  web: { ...config.web, output: 'single' },
  experiments: { ...config.experiments, baseUrl: process.env.PADEL_WEB_BASE_PATH || '' },
});
