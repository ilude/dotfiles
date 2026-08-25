FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN set -eu; \
    mkdir -p /out; \
    CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o /out/dolos-windows-amd64.exe . & p1=$!; \
    CGO_ENABLED=0 GOOS=windows GOARCH=arm64 go build -o /out/dolos-windows-arm64.exe . & p2=$!; \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/dolos-linux-amd64 . & p3=$!; \
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o /out/dolos-linux-arm64 . & p4=$!; \
    CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -o /out/dolos-darwin-amd64 . & p5=$!; \
    CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o /out/dolos-darwin-arm64 . & p6=$!; \
    wait "$p1"; wait "$p2"; wait "$p3"; wait "$p4"; wait "$p5"; wait "$p6"
