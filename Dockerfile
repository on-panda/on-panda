FROM ubuntu:22.04
ENV LC_ALL=C.UTF-8 LANG=C.UTF-8 DEBIAN_FRONTEND=noninteractive SHELL="bash"
RUN apt update
RUN apt install -y git openssh-server tzdata
RUN apt install -y curl net-tools tmux tree htop iputils-ping unzip wget traceroute 
# RUN apt install -y python3 python3-pip python3-dev && ln -s /usr/bin/python3 /usr/bin/python
# RUN pip install flask ipython boxx mximport mxlm --no-cache-dir --prefer-binary
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt install -y nodejs
ENV NODE_PATH="/usr/lib/node_modules"
ENV PNPM_HOME="/usr/local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH:/node_modules/.bin"

# If you are in China and meeting connection error:
RUN npm config set registry https://registry.npmmirror.com

RUN npm install -g pnpm --no-cache && pnpm setup
RUN pnpm install -g eslint prettier vue-tsc npm-run-all --no-cache
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-cache
COPY . /app
WORKDIR /app
CMD pnpm run dev --host
# docker build --network=host -t diyer22/on-panda .
# docker run -it --rm -v `pwd`:/app --net=host diyer22/on-panda