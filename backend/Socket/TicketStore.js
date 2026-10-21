const crypto = require('crypto');

/**
 * In-Memory Single-Use Ticket Store with 30s TTL.
 * Each ticket can only be consumed once, preventing token interception / replay.
 */
class TicketStore {
    constructor() {
        this.tickets = new Map();
        this.TTL_MS = 30 * 1000; // 30 seconds

        // Periodic garbage collection every 60 seconds
        setInterval(() => this.cleanup(), 60 * 1000);
    }

    /**
     * Create a single-use ticket for a verified user.
     * @param {number} userId 
     * @param {string} username 
     * @returns {string} ticket
     */
    createTicket(userId, username) {
        const ticket = 'wst_' + crypto.randomUUID();
        this.tickets.set(ticket, {
            userId: Number(userId),
            username: String(username),
            createdAt: Date.now()
        });
        return ticket;
    }

    /**
     * Verify and immediately consume (delete) a ticket.
     * @param {string} ticket 
     * @returns {{ userId: number, username: string } | null}
     */
    consumeTicket(ticket) {
        if (!ticket || typeof ticket !== 'string') return null;

        const data = this.tickets.get(ticket);
        if (!data) return null;

        // Immediately delete so it cannot be used a second time
        this.tickets.delete(ticket);

        // Check if expired (30 seconds)
        if (Date.now() - data.createdAt > this.TTL_MS) {
            return null;
        }

        return {
            userId: data.userId,
            username: data.username
        };
    }

    /**
     * Clean up expired tickets from memory.
     */
    cleanup() {
        const now = Date.now();
        for (const [ticket, data] of this.tickets.entries()) {
            if (now - data.createdAt > this.TTL_MS) {
                this.tickets.delete(ticket);
            }
        }
    }
}

// Singleton instance
const ticketStore = new TicketStore();

module.exports = ticketStore;
