FROM node:26.12.1-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        clang lld llvm-dev libclang-dev cmake ninja-build patchelf zip unzip \
    && rm -rf /var/lib/apt/lists/*

ENV CARGO_HOME=/opt/cargo \
    RUSTUP_HOME=/opt/rustup \
    VP_BIN_DIR=/opt/vite-plus/bin \
    VP_DATA_DIR=/opt/vite-plus \
    VP_CACHE_DIR=/root/.cache/vite-plus \
    VP_NODE_MANAGER=no \
    VP_VERSION=1.4.0
ENV PATH=/opt/cargo/bin:/opt/vite-plus/bin:$PATH

RUN curl -fsSL https://sh.rustup.rs -o /tmp/rustup-init.sh \
    && sh /tmp/rustup-init.sh -y --profile minimal --default-toolchain 1.99.1 \
        --target x86_64-pc-windows-msvc \
    && cargo install cargo-xwin --version 0.23.1 --locked \
    && rm /tmp/rustup-init.sh
RUN curl -fsSL https://vite.plus -o /tmp/vp-install.sh \
    && bash /tmp/vp-install.sh \
    && rm /tmp/vp-install.sh

COPY build.sh /usr/local/bin/t3-code-windows-build
WORKDIR /workspace
ENTRYPOINT ["bash", "/usr/local/bin/t3-code-windows-build"]
