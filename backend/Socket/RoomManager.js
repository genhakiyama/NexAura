    const { getIO } = require('../socketIo');

async function joinRoom(conversationId , userId , notificationData) {
    try {
        const io = getIO();
        const roomName = `conversation:${conversationId}`;
        io.in(`user:${userId}`).socketsJoin(roomName);
        io.to(roomName).emit('new_notification' , notificationData);
    }
    catch(err){
        console.log('LOI SOCKET');
    }
};

async function notifcationToRoom(conversationId , notification){
    const roomName = `conversation:${conversationId}`;
    getIO().to(roomName).emit('new_notification' , notification);
}

async function sendToRoom(conversationId , message) {
    const roomName = `conversation:${conversationId}`;
    getIO().to(roomName).emit('send_message' , message);
}

async function sendDeletedRoom(conversationId , payload) {
    const roomName = `conversation:${conversationId}`;

    getIO().to(roomName).emit('message_deleted' , payload);
}

module.exports = {
    joinRoom , 
    notifcationToRoom  ,
    sendToRoom , 
    sendDeletedRoom
}