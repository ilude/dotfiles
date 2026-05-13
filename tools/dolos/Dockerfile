FROM golang:1.23-alpine AS build
ARG GOOS=linux
ARG GOARCH=amd64
ARG BINARY=dolos
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=${GOOS} GOARCH=${GOARCH} go build -o /out/${BINARY} .
