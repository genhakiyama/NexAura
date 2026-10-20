require('dotenv').config();
const http = require('http');
const app = require('./Server/app');

const registerHandlers = require('./Socket/SocketHandler');
const server = http.createServer(app);

const io = require('./socketIo').init(server);
registerHandlers(io);


server.listen(process.env.PORT || 3000 , () => {
    console.log('My server is running');
})