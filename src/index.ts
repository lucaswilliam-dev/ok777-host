import app, { io } from './app';

const port = process.env.PORT || 4000;
const server = app.listen(port, () => {
  /* eslint-disable no-console */
  console.log(`Listening: http://localhost:${port}`);
  /* eslint-enable no-console */
});

// Attach Socket.IO to the server
io.attach(server);
