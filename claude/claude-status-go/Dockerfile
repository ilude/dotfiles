FROM golang:1.23-alpine AS builder

WORKDIR /build

COPY go.mod main.go ./

RUN GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o claude-status.exe .
