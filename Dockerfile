# From the official nodejs image, based on Debian Jessy
FROM node:8-alpine

# Install ffmpeg and imagemagick
RUN apk --no-cache add ffmpeg graphicsmagick git

# Building
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install
COPY *bower* /usr/src/app/
RUN node node_modules/bower/bin/bower install --allow-root
COPY . /usr/src/app

# Default HTTP port
EXPOSE 8075

# Start the server
CMD ["node", "server.js"]
