FROM node:18-alpine

WORKDIR /app

# Copia package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copia tutto il resto
COPY . .

# Crea directory output
RUN mkdir -p /app/output/m3u /app/output/json

# Comando da eseguire
CMD ["npm", "start"]
