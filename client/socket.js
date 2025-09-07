// Centralized socket connection and helpers
export const socket = io();

export function onRoomState(handler) {
  socket.on('room:state', handler);
}

export function onDraftState(handler) {
  socket.on('draft:state', handler);
}


