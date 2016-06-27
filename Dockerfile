# From the official nodejs image, based on Debian Jessy
FROM node:5.12.0

# Add the jessy-backports repository, to install the true FFmpeg library
RUN awk '$1 ~ "^deb" { $3 = $3 "-backports"; print; exit }' /etc/apt/sources.list > /etc/apt/sources.list.d/backports.list

# Install ffmpeg and graphicsmagick
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y -q graphicsmagick ffmpeg

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