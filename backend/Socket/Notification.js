module.exports = (io , socket) => {
    socket.on('send_message' , async (payload) => {
        if (payload.error) {
            return socket.emit('error' , payload.error);
        }

        const { conversationId , message } = payload;
        const userId = socket.userId;
        const username = socket.username;
        const roomName = `conversation:${conversationId}`;
        
        socket.to(roomName).emit('new_message' , {
            fromUser : username , 
            message
        });
    });
};