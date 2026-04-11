FROM debian:trixie
RUN mkdir -p /app
RUN mkdir -p /app/config
WORKDIR /app
RUN apt-get update && apt-get upgrade -y && apt-get install -y curl wget bash build-essential
RUN wget https://download.oracle.com/java/25/latest/jdk-25_linux-x64_bin.deb
RUN dpkg -i jdk-25_linux-x64_bin.deb
RUN rm -rf ./jdk-25_linux-x64_bin.deb
RUN wget https://github.com/AsamK/signal-cli/releases/download/v0.14.1/signal-cli-0.14.1.tar.gz -O tmp.tar.gz
RUN tar -xvf tmp.tar.gz
RUN mv ./signal-cli-0.14.1/bin/* /usr/local/bin/
RUN mv ./signal-cli-0.14.1/lib/* /usr/local/lib/
RUN rm -rf ./signal-cli-0.14.1
RUN rm -rf ./tmp.tar.gz
RUN apt-get update && apt-get upgrade -y && apt-get clean
CMD [ "signal-cli", "--config", "/app/config", "daemon", "--tcp", "0.0.0.0:64", "--receive-mode", "on-connection", "--no-receive-stdout" ]
