# syntax=docker/dockerfile:1.7

ARG GO_VERSION=1.24.4

FROM golang:${GO_VERSION} AS builder
WORKDIR /src

COPY services/server/go.mod services/server/go.sum ./
RUN go mod download

COPY services/server/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/server .

FROM gcr.io/distroless/base-debian12
WORKDIR /app
COPY --from=builder /out/server /app/server
COPY services/server/.env /app/.env
EXPOSE 9000
USER nonroot:nonroot
CMD ["/app/server"]
