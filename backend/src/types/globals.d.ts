// Global type declarations
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from './index';

declare global {
  var __io: Server<ClientToServerEvents, ServerToClientEvents> | undefined;
}

export {};