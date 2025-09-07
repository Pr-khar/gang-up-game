## Gang Up - MVP Modular Structure

### Overview
This refactor separates the client (frontend) and server (backend) into distinct folders with clear responsibilities and scalable modules.

### Project Layout
```
client/
  index.html          # Single HTML entry
  styles.css          # Styles
  main.js             # App entry: routes to screens, binds UI events
  socket.js           # Centralized Socket.IO client
  screens/
    lobby.js          # Lobby screen render logic
    draft.js          # Draft screen render logic
    voting.js         # Voting screen render logic
    results.js        # Results screen render logic

server/
  server.js           # Server entry (Express + Socket.IO)
  questions.js        # Question templates
  scoring.js          # (Placeholder) scoring/aggregation helpers
  helpers/
    schedule.js       # Scheduling and round computation utilities

package.json          # Scripts point to server/server.js
```

### Development
- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Start production server: `npm start`

The backend serves static files from `client/` and Socket.IO from `/socket.io`.

### Notes
- In-memory state is used for rooms and players. Replace with a DB/Redis for production.
- Add more modules under `server/helpers/` as logic grows (validation, persistence, etc.).


