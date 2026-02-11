require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  require('./dist/main.js');
} else {
  throw new Error(
    'Development mode not supported via server.js wrapper. Use: npm run dev',
  );
}
