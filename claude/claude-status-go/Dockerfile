FROM golang:1.23-alpine AS builder

ARG GOOS=windows
ARG GOARCH=amd64
ARG BINARY=claude-status.exe

WORKDIR /build

COPY go.mod main.go ./

RUN GOOS=${GOOS} GOARCH=${GOARCH} go build -ldflags="-s -w" -o ${BINARY} .
