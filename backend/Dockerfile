# ==============================================================================
# QuizInejoma Backend - Multi-Stage Production Dockerfile (rust:latest)
# ==============================================================================

# Stage 1: Build binary using rust:latest
FROM rust:latest AS builder

WORKDIR /app

# Copy dependency manifests
COPY Cargo.toml Cargo.lock* ./

# Copy source code
COPY src ./src

# Build release binary
RUN cargo build --release

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies (OpenSSL & CA certificates for TLS/HTTPS)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled binary from builder
COPY --from=builder /app/target/release/quizinejoma-backend /app/quizinejoma-backend

# Expose backend port
EXPOSE 8080

# Run backend service
CMD ["/app/quizinejoma-backend"]
