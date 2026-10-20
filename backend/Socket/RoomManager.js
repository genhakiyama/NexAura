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
    try {
        getIO().to(roomName).emit('new_notification' , notification);
    } catch (err) {
        console.error('[socket] notification broadcast failed:' , err.message);
    }
}

async function sendToRoom(conversationId , message) {
    const roomName = `conversation:${conversationId}`;
    try {
        getIO().to(roomName).emit('send_message' , message);
    } catch (err) {
        // The message is already persisted; a socket problem must not turn the
        // HTTP send into a 500 and make the sender think it was not saved.
        console.error('[socket] message broadcast failed:' , err.message);
    }
}

async function sendDeletedRoom(conversationId , payload) {
    const roomName = `conversation:${conversationId}`;
    try {
        getIO().to(roomName).emit('message_deleted' , payload);
    } catch (err) {
        console.error('[socket] delete broadcast failed:' , err.message);
    }
}

async function sendToUser(userId , event , payload) {
    try {
        getIO().to(`user:${userId}`).emit(event , payload);
    } catch (err) {
        console.error('[socket] sendToUser failed:' , err.message);
    }
}

module.exports = {
    joinRoom , 
    notifcationToRoom  ,
    sendToRoom , 
    sendDeletedRoom ,
    sendToUser
}