FROM ubuntu:18.04

RUN apt-get update && apt-get install -y sudo
RUN apt-get -y upgrade
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
RUN apt-get install -y nodejs
RUN apt-get install --reinstall libgtk2.0-0 -y
RUN apt-get install -y libgbm-dev
RUN apt-get install libnss3 libnss3-tools libxss1 libgtk-3-0 -y
RUN apt-get install chromium-browser -y
# To allow MP3 conversion
RUN apt-get install ffmpeg -y

COPY index.js /index.js
COPY episode.json /episode.json
# used by nmp ci
COPY package-lock.json /package-lock.json
COPY package.json /package.json
COPY entrypoint.sh /entrypoint.sh

RUN chmod 777 /entrypoint.sh
ENV LC_ALL=en_US.UTF-8

WORKDIR /

RUN npm ci 
# RUN sudo npm i puppeteer --unsafe-perm=true --allow-root

RUN curl -k -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/youtube-dl && chmod a+rx /usr/local/bin/youtube-dl

# RUN sudo npm i puppeteer --unsafe-perm=true --allow-root

CMD node /index.js

COPY test.js /