# Base image: Node.js 24 LTS on Alpine (small and pinned)
FROM node:24-alpine

# All app files live in /app inside the container
WORKDIR /app

# Copy dependency files first so Docker can cache the install layer
COPY package*.json ./

# Install production dependencies only, exactly as listed in package-lock.json
RUN npm ci --omit=dev

# Copy the rest of the source code
COPY . .

# Document the port this service listens on
EXPOSE 3002

# Run as the unprivileged "node" user instead of root
USER node

# Start the service (JSON form so signals reach Node directly)
CMD ["node", "server.js"]
