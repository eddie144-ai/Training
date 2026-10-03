// Extends app.json. EXPO_BASE_URL sets the path the web build is served from (for example
// /Training/deliberation on GitHub Pages); it's unset in development.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL && { baseUrl: process.env.EXPO_BASE_URL }),
  },
});
