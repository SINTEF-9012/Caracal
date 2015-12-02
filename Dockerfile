FROM ubuntu:trusty

EXPOSE 8075

# verify gpg and sha256: http://nodejs.org/dist/v0.10.30/SHASUMS256.txt.asc
# gpg: aka "Timothy J Fontaine (Work) <tj.fontaine@joyent.com>"
# gpg: aka "Julien Gilli <jgilli@fastmail.fm>"
RUN gpg --keyserver pool.sks-keyservers.net --recv-keys 7937DFD2AB06298B2293C3187D33FF9D0246406D 114F43EE0176B71C7BC219DD50A3051F888C628D

ENV DEBIAN_FRONTEND noninteractive

RUN apt-get update
RUN apt-get install -y curl wget software-properties-common graphicsmagick git git-core
RUN add-apt-repository -y ppa:mc3man/trusty-media
RUN apt-get update
RUN apt-get install -y ffmpeg

ENV NODE_VERSION 0.12.0
ENV NPM_VERSION 2.5.0

RUN curl -SLO "http://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" \
        && curl -SLO "http://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt.asc" \
        && gpg --verify SHASUMS256.txt.asc \
        && grep " node-v$NODE_VERSION-linux-x64.tar.gz\$" SHASUMS256.txt.asc | sha256sum -c - \
        && tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 \
        && rm "node-v$NODE_VERSION-linux-x64.tar.gz" SHASUMS256.txt.asc \
        && npm install -g npm@"$NPM_VERSION" \
        && npm cache clear

RUN npm install -g bower

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

RUN useradd caracal && echo "caracal:caracal" | chpasswd
RUN mkdir -p /home/caracal && chown -R caracal:caracal /home/caracal && chown -R caracal:caracal /usr/src/app
USER caracal

RUN git clone --depth=1 https://github.com/SINTEF-9012/Caracal.git
WORKDIR /usr/src/app/Caracal
RUN npm install
RUN bower install

CMD [ "/usr/local/bin/npm", "start"]
